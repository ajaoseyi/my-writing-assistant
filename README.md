# AI Grammar & Writing Assistant

An AI-powered tool to analyze and improve your documents using Llama 3 models via Groq.

## Features

- **Document Analysis**: Upload `.txt` or `.md` files or paste text directly.
- **Grammar & Spelling Check**: Identify and fix common writing errors.
- **Sentence Structure Improvement**: Paraphrase for better flow and clarity.
- **Revised Version**: Get a fully edited version of your content.
- **Fast Performance**: Powered by Groq's Llama 3 models.

## Setup

### Prerequisites

- Node.js (v18+)
- Groq API Key (Get one at [console.groq.com](https://console.groq.com/))

### Installation

1. Clone the repository.
2. Install backend dependencies:
   ```bash
   cd server
   npm install
   ```
3. Install frontend dependencies:
   ```bash
   cd client
   npm install
   ```

### Configuration

Create a `.env` file in the `server` directory:
```env
GROQ_API_KEY=your_groq_api_key_here
PORT=3001
```

### Running the App

1. Start the backend:
   ```bash
   cd server
   npm run dev
   ```
2. Start the frontend:
   ```bash
   cd client
   npm run dev
   ```
3. Open [http://localhost:3000](http://localhost:3000) in your browser.

Note: The backend runs on [http://localhost:3001/api](http://localhost:3001/api). The frontend is configured to proxy requests to this address.

## Tech Stack

- **Frontend**: React, TypeScript, Vite, Axios, Lucide React
- **Backend**: Node.js, Express, LangChain, @langchain/groq, Multer
- **AI**: Llama 3 (via Groq Cloud)
