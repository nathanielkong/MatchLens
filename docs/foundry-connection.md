# Connect Microsoft Foundry to MatchLens

The browser talks to the local Express backend. Only that backend reads the Foundry key and sends model requests. No key belongs in frontend code or a `VITE_` variable.

## Your Azure setup

1. Open https://ai.azure.com and sign in with your Azure account.
2. Create a project if needed. Suggested name: `matchlens-ai`; select your existing `matchlens-dev` resource group under Advanced options and an available region.
3. In the new Foundry experience, open **Build → Models → Deploy → Deploy a base model**. Choose an available text model that supports the Responses API. Microsoft’s quickstart uses `gpt-5-mini`; availability depends on your subscription and region.
4. Select a **Global Standard** pay-per-token deployment for the prototype. Review the displayed rates before creating it. Use deployment name `matchlens-insights` or record the exact name you choose.
5. Open the deployment details and copy the model/resource endpoint and key. This connector accepts resource URLs such as `https://your-resource.openai.azure.com` or `https://your-resource.services.ai.azure.com`, optionally ending `/openai/v1/`. Project URLs containing `/api/projects/` belong to a different connection path and are rejected here.
6. Fill the three `AZURE_OPENAI_…` settings in the private `backend/.env.foundry` file. Keep `AI_ENABLED=false`. The committed `backend/foundry.env.example` shows the format.

Sources: [Microsoft project and model quickstart](https://learn.microsoft.com/en-us/azure/foundry/tutorials/quickstart-create-foundry-resources), [deployment types](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/deployment-types), [endpoints and API-key authentication](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/endpoints).

## Local check and connection test

Run `npm run ai:check -w backend` from the project folder. This reads the private file and validates the endpoint, deployment name, presence of a key and request settings. **It does not contact Azure or verify the key remotely.** The backend also exposes `/api/ai/status` with the same safe readiness information. Restart the API after editing the private settings.

An explicit live probe is available with `npm run ai:check -w backend -- --live` after setting `AI_ENABLED=true`. This makes one token-billed request asking for the word CONNECTED. It sends no match data and does not retry on failure. Ordinary startup, readiness checks, scrolling and replay playback never call the model.

Default client limits: 400 output tokens per request, 16,000 input characters, 15-second timeout and ten requests per client instance/process. The client must be reused when agents are connected. Its allowance resets on restart; it is **not an Azure account spending cap**. Azure budgets and alerts remain separate account controls.

The connection adapter uses the Azure OpenAI v1 Responses route with the exact deployment alias as `model` and `store:false`. It returns generated text and reported token counts. Response errors do not echo provider bodies or credentials. Configuration and transport tests use fake credentials and a fake transport, with no model charges.

## What remains

This is a prepared model connection, not a complete insights engine. The orchestrator, cutoff-safe evidence contract, analysis/narrative/verifier responsibilities, grounded Q&A, producer output and bounded rewrite handling still need implementation. The current UI continues to label them as planned. The model client will be used only after that evidence boundary is built; position samples and private truth tables must stay outside its prompts.
