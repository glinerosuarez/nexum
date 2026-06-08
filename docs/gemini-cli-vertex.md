# Gemini CLI via Vertex AI

This repo now includes a project-local Gemini CLI configuration for the Nexum
Google Cloud project.

## Fixed project settings

- Auth mode: Vertex AI
- Project: `nexum-497302`
- Location: `global`
- Default model: `gemini-3-flash-preview`

The project-level settings live in:

- `.gemini/settings.json`
- `.gemini/.env`

## One-time auth step

Gemini CLI with Vertex AI needs Application Default Credentials (ADC). This
machine did not have ADC configured yet, so run:

```bash
CLOUDSDK_CONFIG=/private/tmp/codex-gcloud \
gcloud auth application-default login --no-launch-browser
```

That writes ADC to:

```bash
/private/tmp/codex-gcloud/application_default_credentials.json
```

## Launch command

From the repo root:

```bash
./scripts/gemini-vertex.sh
```

Headless example:

```bash
./scripts/gemini-vertex.sh -p "Summarize the current project structure."
```

If you already have ADC somewhere else, override it at launch time:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/path/to/adc.json ./scripts/gemini-vertex.sh
```
