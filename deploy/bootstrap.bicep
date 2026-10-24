// Stage 1: provision hosting prerequisites before building the application image.
// This template creates billable resources only when explicitly deployed.
targetScope = 'resourceGroup'

@maxLength(20)
param prefix string = 'matchlens-web'
param location string = resourceGroup().location
param registryName string = 'ml${uniqueString(resourceGroup().id, prefix)}'
param databaseServerName string = 'matchlens'

// Keep the app subnet separate from private endpoints. PostgreSQL remains an
// existing resource; this template does not replace it or alter its firewall.
resource network 'Microsoft.Network/virtualNetworks@2024-05-01' = {
  name: '${prefix}-network'
  location: location
  properties: {
    addressSpace: { addressPrefixes: ['10.42.0.0/16'] }
    subnets: [
      {
        name: 'container-apps'
        properties: {
          addressPrefix: '10.42.0.0/23'
          delegations: [
            { name: 'container-apps', properties: { serviceName: 'Microsoft.App/environments' } }
          ]
        }
      }
      {
        name: 'private-endpoints'
        properties: {
          addressPrefix: '10.42.2.0/24'
          privateEndpointNetworkPolicies: 'Disabled'
        }
      }
    ]
  }
}

resource appSubnet 'Microsoft.Network/virtualNetworks/subnets@2024-05-01' existing = {
  parent: network
  name: 'container-apps'
}
resource endpointSubnet 'Microsoft.Network/virtualNetworks/subnets@2024-05-01' existing = {
  parent: network
  name: 'private-endpoints'
}
resource database 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' existing = {
  name: databaseServerName
}
resource databaseEndpoint 'Microsoft.Network/privateEndpoints@2024-05-01' = {
  name: '${prefix}-postgres'
  location: location
  properties: {
    subnet: { id: endpointSubnet.id }
    privateLinkServiceConnections: [
      {
        name: 'postgresql'
        properties: {
          privateLinkServiceId: database.id
          groupIds: ['postgresqlServer']
        }
      }
    ]
  }
}

// Azure creates the endpoint's A record via its DNS zone group. The original
// matchlens.postgres.database.azure.com hostname still works with verified TLS.
resource databaseDns 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: 'privatelink.postgres.database.azure.com'
  location: 'global'
}
resource databaseDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  parent: databaseDns
  name: '${prefix}-link'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: { id: network.id }
  }
}
resource databaseDnsGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-05-01' = {
  parent: databaseEndpoint
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      { name: 'postgresql', properties: { privateDnsZoneId: databaseDns.id } }
    ]
  }
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: registryName
  location: location
  sku: { name: 'Basic' }
  properties: { adminUserEnabled: false }
}

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${prefix}-identity'
  location: location
}

resource pullAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, identity.id, 'AcrPull')
  scope: registry
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
  }
}

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${prefix}-logs'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
    workspaceCapping: { dailyQuotaGb: 1 }
  }
}

resource environment 'Microsoft.App/managedEnvironments@2025-07-01' = {
  name: '${prefix}-environment'
  location: location
  properties: {
    vnetConfiguration: {
      infrastructureSubnetId: appSubnet.id
      internal: false
    }
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
    workloadProfiles: [
      { name: 'Consumption', workloadProfileType: 'Consumption' }
    ]
  }
}

output registryName string = registry.name
output registryServer string = registry.properties.loginServer
output environmentName string = environment.name
output identityName string = identity.name
output databasePrivateEndpointName string = databaseEndpoint.name
output virtualNetworkName string = network.name
