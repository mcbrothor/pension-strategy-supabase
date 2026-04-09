import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const app = express();
app.use(express.json());

// Mock request and response for serverless handlers
async function serveApi() {
  const apiDir = path.join(rootDir, 'api');
  const apiFiles = fs.readdirSync(apiDir).filter(f => f.endsWith('.js'));
  
  for (const file of apiFiles) {
    const route = '/api/' + file.replace('.js', '');
    const modulePath = path.resolve(apiDir, file);
    const { default: handler } = await import(`file://${modulePath}`);
    
    app.all(route, async (req, res) => {
      console.log(`[API] ${req.method} ${route}`);
      // Simulate Vercel response object
      const vercelRes = {
        status: (code) => {
          res.status(code);
          return vercelRes;
        },
        json: (data) => {
          res.json(data);
          return vercelRes;
        },
        setHeader: (name, value) => {
          res.setHeader(name, value);
          return vercelRes;
        },
        set: (name, value) => {
          // Express's res.set can handle objects or key-value
          if (typeof name === 'object') {
              res.set(name);
          } else {
              res.set(name, value);
          }
          return vercelRes;
        },
        end: () => {
          res.end();
          return vercelRes;
        },
        send: (data) => {
            res.send(data);
            return vercelRes;
        }
      };
      
      try {
        await handler(req, vercelRes);
      } catch (err) {
        console.error(`Error in ${route}:`, err);
        res.status(500).json({ error: err.message });
      }
    });
    console.log(`Registered route: ${route}`);
  }

  const PORT = 3000;
  app.listen(PORT, () => {
    console.log(`Test API Server running at http://localhost:${PORT}`);
  });
}

serveApi().catch(console.error);
