/// <reference types="vite/client" />

declare module '*.png?asset' {
  const path: string;
  export default path;
}

declare module '*.sql?raw' {
  const sql: string;
  export default sql;
}
