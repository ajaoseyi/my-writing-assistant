# AI Writing Assistant: Tutorial Demo

This tutorial provides a deep dive into the code behind our AI Writing Assistant. We'll break down the core logic line-by-line for both the backend and frontend.

## 1. Backend Logic Breakdown (`server/src/index.ts`)

The backend is responsible for processing documents and communicating with the Groq LLM using LangChain.

### Core Imports
- **`express`**: Our web framework.
- **`multer`**: Middleware for handling file uploads.
- **`@langchain/groq`**: The driver that connects us to Groq's Llama 3 model.
- **`ChatPromptTemplate`**: Helps us structure the instructions we send to the AI.

### The Analysis Pipeline
```typescript
const chain = prompt.pipe(model).pipe(outputParser);
```
- **`.pipe()`**: This is LangChain's "Expression Language" (LCEL). It chains multiple components together.
- **`prompt`**: Takes the raw user input and wraps it in a "System Message" (the AI's persona) and a "User Message" (the task).
- **`model`**: Sends the structured prompt to Groq and gets a raw response.
- **`outputParser`**: Cleans up the raw response and returns it as a simple string.

### Dynamic Prompting
We use "Prompt Engineering" to tell the AI exactly what to do based on user selection:
- If `grammar` is checked, we add instructions to look for spelling/grammar.
- If `paraphrase` is checked, we ask for better sentence structure.
- If `revised` is checked, we ask for a full edit at the end.

---

## 2. Frontend Logic Breakdown (`client/src/App.tsx`)

The frontend manages user interaction and handles the multi-part form submission.

### Managing State
```typescript
const [file, setFile] = useState<File | null>(null)
const [options, setOptions] = useState({ grammar: true, paraphrase: false })
```
- We use React's `useState` to keep track of what the user has selected or uploaded.
- `file` stores the actual binary data of the document.
- `options` is an object that keeps track of the checkboxes.

### Sending Data (FormData)
Because we are uploading a file AND sending JSON-like options, we use the `FormData` browser API:
```typescript
const formData = new FormData()
formData.append('document', file)
formData.append('options', JSON.stringify(options))
```
- This allows us to send the file as binary data while the options are sent as a stringified object.

---

## 3. Reusable Components

### `FileUploader.tsx`
- Uses a hidden `<input type="file">` triggered by a custom-styled div.
- Uses `useRef` to programmatically open the file picker.
- Handles both selection and removal of files.

### `OptionSelector.tsx`
- A modular component that renders the checkboxes.
- It takes `options` and `setOptions` as props, following the React pattern of "Lifting State Up".

### `ResultDisplay.tsx`
- Parses the AI's response.
- It looks for headers like "Issues Found:" and "Revised Version:" to apply special styling, making the output easier to read.

---

## 4. Key Configuration

### `vite.config.ts` (The Proxy)
```typescript
proxy: {
  '/api': {
    target: 'http://localhost:3001',
    rewrite: (path) => path.replace(/^\/api/, ''),
  },
}
```
- This is crucial! It allows our React app (on port 3000) to call `/api/analyze` as if it were on the same server, preventing CORS issues during development and simplifying the code.
