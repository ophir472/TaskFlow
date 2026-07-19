# TaskFlow

A personal task management app built with React, TypeScript, and Vite. Stores all data locally in your browser (no account or server needed).

## Setup on a new computer

**Prerequisites:** [Node.js](https://nodejs.org/) (v18 or later) and [Git](https://git-scm.com/)

```bash
# 1. Clone the repo
git clone https://github.com/ophir472/TaskFlow.git
cd TaskFlow/app

# 2. Install dependencies
npm install

# 3. Start the dev server
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173) in your browser.

## Other commands

```bash
npm run build    # production build
npm run preview  # preview the production build locally
```

## Notes

- All data is stored in your browser's `localStorage` — it won't carry over to a different browser or machine automatically.
- To move your data, open DevTools → Application → Local Storage → copy the `taskflow-store` key and paste it on the new machine.
