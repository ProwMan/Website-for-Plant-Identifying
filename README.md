# ACS(I) Plant Spotter

A professional, mobile-optimized web application designed for the Environment Focus Group (EFG) at ACS Independent. This app allows students to identify campus flora, track their discoveries, and compete on a leaderboard.

## Playable Demo Setup

To get a live URL for your project using **GitHub Pages**:

1.  **Restore your keys locally:** Fill in the placeholders in `src/lib/firebase.ts` and `src/lib/api/identify.functions.ts` with your actual API keys.
2.  **Build the project:**
    ```bash
    npm run build
    ```
3.  **Deploy to GitHub Pages:**
    *   Push your code to a GitHub repository.
    *   Go to **Settings > Pages** in your repo.
    *   Set the **Source** to "Deploy from a branch".
    *   Select your branch (e.g., `main`) and set the folder to `/docs` (or use a GitHub Action for automated deployment of the `dist` folder).

## Local Development

### 1. Prerequisites
*   Node.js installed.
*   A Firebase project (Spark plan is fine).
*   A Pl@ntNet API key from [my.plantnet.org](https://my.plantnet.org/).

### 2. Installation
```bash
git clone <your-repo-url>
cd PlantIdentifierWeb
npm install
```

### 3. Configuration (Required)
For security, all API keys have been replaced with placeholders. You **must** update these files before the app will work:

*   **Firebase:** Update `src/lib/firebase.ts` with your web config.
*   **Pl@ntNet:** Update `src/lib/api/identify.functions.ts` with your API key.

### 4. Running
```bash
npm run dev
```

## Security Note
This repository has been scrubbed of all sensitive credentials. If you are fork/cloning this for public use, **do not commit your actual API keys back to the repository.** Use environment variables or GitHub Secrets for production deployments.

---
**Developed by:** Selvakumar Madhan 
**Institution:** ACS Independent  
**Year:** 2026
