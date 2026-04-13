# naver-auto

AI-powered Naver Blog automation tool.

## Key Features
- **GPT/DALL-E Integration:** Generate blog content and images automatically using AI.
- **Multi-account Management:** Manage multiple Naver accounts and blogs.
- **Playwright Automation:** Reliable and robust blog posting automation.
- **Interactive Dashboard:** Easy-to-use React-based dashboard for managing tasks and settings.

## Setup Requirements
- **Node.js:** Version 18.0.0 or higher.
- **OpenAI API Key:** For content generation (GPT-4/DALL-E 3).

## Installation and Usage

You can run `naver-auto` directly using `npx`:

```bash
npx naver-auto
```

This will:
1. Start the backend server on `http://localhost:3000`.
2. Open your default browser to the dashboard.

### Local Development Setup

If you want to clone and run the project locally:

1. Clone the repository:
   ```bash
   git clone https://github.com/your-repo/naver-auto.git
   cd naver-auto
   ```

2. Install dependencies:
   ```bash
   npm install
   ```
   This project automatically installs the Playwright Chromium browser during installation.

   If browser installation fails due to network/security policy, run:
   ```bash
   npm run playwright:install
   ```

3. Build the client:
   ```bash
   npm run client:build
   ```

4. Start the server:
   ```bash
   npm start
   ```

## Configuration
When you first run the app, you will need to provide your OpenAI API Key and Naver account details through the dashboard. All sensitive information is stored locally in an encrypted database (`naver-auto.db`).
