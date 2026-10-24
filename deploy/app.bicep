// Stage 2: deploy only after bootstrap, image build and database network access.
// Pass secret parameters from a local ignored *.local.json file or a secret store.
// Do not put an administrator DATABASE_URL or a model API key in this application.
targetScope = 'resourceGroup'

@maxLength(20)
param prefix string = 'matchlens-web'
param location string = resourceGroup().location
param registryName string = 'ml${uniqueString(resourceGroup().id, prefix)}'
@description('Immutable Git commit tag already built in the registry, never latest.')
@minLength(7)
param imageTag string
@secure()
@minLength(32)
param sessionSecret string
@secure()
param appDatabaseUrl string
param foundryAccountName string = 'matchlens-nk-20261021-a7f3'
param foundryProjectName string = 'matchlens-ai'
param agentName string = 'matchlens-connection-test'
param agentVersion string = '2'
param modelDeploymentName string = 'matchlens-openai/gpt-6-luna'
@description('Enable only after production daily SQL limits and Foundry access are verified.')
param publicAIEnabled bool = false
@allowed([0, 1])
@description('Zero scales to idle; one avoids cold starts and costs more.')
param minimumReplicas int = 0

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: registryName
}
resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: '${prefix}-identity'
}
resource environment 'Microsoft.App/managedEnvironments@2025-07-01' existing = {
  name: '${prefix}-environment'
}
resource foundry 'Microsoft.CognitiveServices/accounts@2025-06-01' existing = {
  name: foundryAccountName
}
resource project 'Microsoft.CognitiveServices/accounts/projects@2025-06-01' existing = {
  parent: foundry
  name: foundryProjectName
}

// The runtime reads the pinned agent version as well as invoking it. The narrower
// Agent Consumer role only grants endpoint interaction and cannot perform both.
// Scope Foundry User to this project, never the subscription or resource group.
resource foundryAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(project.id, identity.id, 'FoundryUser')
  scope: project
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '53ca6127-db72-4b80-b1b0-d745d6d5456d')
  }
}

var publicHost = '${prefix}.${environment.properties.defaultDomain}'
resource app 'Microsoft.App/containerApps@2025-07-01' = {
  name: prefix
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${identity.id}': {} }
  }
  properties: {
    environmentId: environment.id
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        allowInsecure: false
        targetPort: 8080
        transport: 'http'
      }
      registries: [
        { server: registry.properties.loginServer, identity: identity.id }
      ]
      secrets: [
        { name: 'session-secret', value: sessionSecret }
        { name: 'app-database-url', value: appDatabaseUrl }
      ]
    }
    template: {
      containers: [
        {
          name: 'matchlens'
          image: '${registry.properties.loginServer}/matchlens:${imageTag}'
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: [
            { name: 'NODE_ENV', value: 'production' }
            { name: 'HOST', value: '0.0.0.0' }
            { name: 'PORT', value: '8080' }
            { name: 'SESSION_SECRET', secretRef: 'session-secret' }
            { name: 'APP_DATABASE_URL', secretRef: 'app-database-url' }
            { name: 'AI_PROVIDER', value: 'foundry-agent' }
            { name: 'AI_ENABLED', value: 'true' }
            { name: 'PUBLIC_AI_ENABLED', value: string(publicAIEnabled) }
            { name: 'AI_ALLOWED_ORIGINS', value: 'https://${publicHost}' }
            { name: 'AI_PERSIST_CONVERSATIONS', value: 'true' }
            { name: 'AI_MAX_OUTPUT_TOKENS', value: '2000' }
            { name: 'AI_LONG_OUTPUT_TOKENS', value: '6000' }
            { name: 'AI_REVIEW_OUTPUT_TOKENS', value: '4000' }
            { name: 'AZURE_CLIENT_ID', value: identity.properties.clientId }
            { name: 'FOUNDRY_PROJECT_ENDPOINT', value: 'https://${foundryAccountName}.services.ai.azure.com/api/projects/${foundryProjectName}' }
            { name: 'FOUNDRY_AGENT_NAME', value: agentName }
            { name: 'FOUNDRY_AGENT_VERSION', value: agentVersion }
            { name: 'FOUNDRY_MODEL_DEPLOYMENT_NAME', value: modelDeploymentName }
          ]
          probes: [
            {
              type: 'Startup'
              httpGet: { path: '/api/health', port: 8080 }
              periodSeconds: 3
              timeoutSeconds: 2
              failureThreshold: 30
            }
            {
              type: 'Liveness'
              httpGet: { path: '/api/health', port: 8080 }
              periodSeconds: 30
              timeoutSeconds: 3
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: { path: '/api/ready', port: 8080 }
              periodSeconds: 15
              timeoutSeconds: 12
              failureThreshold: 3
            }
          ]
        }
      ]
      // AI workflow concurrency currently relies on a process-local gate.
      scale: {
        minReplicas: minimumReplicas
        maxReplicas: 1
        rules: [
          { name: 'http', http: { metadata: { concurrentRequests: '20' } } }
        ]
      }
    }
  }
  dependsOn: [foundryAccess]
}

output url string = 'https://${app.properties.configuration.ingress.fqdn}'
