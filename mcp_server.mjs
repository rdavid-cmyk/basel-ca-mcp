import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import cors from "cors";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const API_BASE_URL = process.env.BASEL_API_URL || `http://localhost:${process.env.PORT || 8090}`;
const API_KEY = process.env.BASEL_API_KEY || "bca_test_key";
const MCP_PORT = process.env.MCP_PORT || 3000;

// Configure Axios client with the API key
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "X-API-Key": API_KEY,
    "Content-Type": "application/json",
  },
});

// Factory: creates a fresh Server instance with all tools registered.
// Called once per SSE connection so instances are never shared.
function createMcpServer() {
  const server = new Server(
    {
      name: "basel-ca-api-mcp",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "get_competent_authority",
          description: "Retrieves details of a specific Basel Convention Competent Authority by its country code or name.",
          inputSchema: {
            type: "object",
            properties: {
              country_code: {
                type: "string",
                description: "The name or code of the country (e.g., 'Trinidad and Tobago' or 'TT')",
              },
            },
            required: ["country_code"],
          },
        },
        {
          name: "list_competent_authorities",
          description: "Returns a list of all 182 Basel Convention Competent Authorities.",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "check_api_health",
          description: "Checks the status of the Basel CA API.",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "get_competent_authority": {
          const countryCode = String(args?.country_code);
          if (!countryCode) {
            throw new Error("country_code is required");
          }

          const response = await apiClient.get(`/api/v1/ca/${encodeURIComponent(countryCode)}`);

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(response.data, null, 2),
              },
            ],
          };
        }

        case "list_competent_authorities": {
          const response = await apiClient.get("/api/v1/ca");

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(response.data, null, 2),
              },
            ],
          };
        }

        case "check_api_health": {
          const response = await axios.get(`${API_BASE_URL}/api/v1/health`);

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(response.data, null, 2),
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      const errorMsg = error.response?.data?.message || error.message;
      return {
        content: [
          {
            type: "text",
            text: `Error interacting with Basel API: ${errorMsg}`,
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

// Start the server
async function main() {
  const transportMode = process.env.MCP_TRANSPORT || "stdio";

  if (transportMode === "sse") {
    const app = express();
    app.use(cors());

    // Map of sessionId -> { transport, server } for active SSE connections
    const sessions = new Map();


    app.get('/.well-known/mcp/server-card.json', (req, res) => {
      res.json({
        name: 'DexMetal Basel CA MCP',
        description: 'Live MCP server providing programmatic access to 182 Basel Convention Competent Authorities.',
        url: 'https://mcp.dexmetal.com/sse',
        tools: [
          { name: 'get_competent_authority', description: 'Returns CA name, address, contact, and jurisdiction for any ISO country code' },
          { name: 'list_competent_authorities', description: 'Returns all 182 Basel Convention Competent Authorities' },
          { name: 'check_api_health', description: 'Health check for the Basel CA API' }
        ],
        homepage: 'https://dexmetal.com',
        contact: 'info@dexmetal.com'
      });
    });

    app.get("/sse", async (req, res) => {
      const sessionId = crypto.randomUUID();

      // Fresh server instance per connection — never reuse across connections
      const server = createMcpServer();
      const transport = new SSEServerTransport("/message", res);

      sessions.set(sessionId, { transport, server });

      res.on("close", () => {
        sessions.delete(sessionId);
        console.log(`SSE connection closed: ${sessionId}`);
        server.close().catch(() => {});
      });

      await server.connect(transport);
      console.log(`New SSE connection established: ${sessionId}`);
    });

    app.post("/message", async (req, res) => {
      const sessionId = req.query.sessionId;
      const session = sessions.get(sessionId);
      if (session) {
        await session.transport.handlePostMessage(req, res);
      } else {
        res.status(400).send("No active SSE connection for sessionId: " + sessionId);
      }
    });

    app.get("/", (req, res) => {
      res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Basel CA MCP Server — DexMetal</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 700px; margin: 60px auto; padding: 0 24px; background: #1C1B18; color: #f5f5f0; }
    h1 { color: #1D9E75; font-size: 1.8rem; }
    code { background: #2a2925; padding: 2px 8px; border-radius: 4px; font-size: 0.9rem; }
    pre { background: #2a2925; padding: 16px; border-radius: 8px; overflow-x: auto; }
    a { color: #1D9E75; }
    .badge { display: inline-block; background: #1D9E75; color: #1C1B18; padding: 4px 12px; border-radius: 4px; font-weight: bold; font-size: 0.85rem; margin-bottom: 24px; }
  </style>
</head>
<body>
  <div class="badge">MCP SERVER · LIVE</div>
  <h1>Basel Convention CA MCP Server</h1>
  <p>Access Competent Authority data for <strong>182 countries</strong> via the Model Context Protocol. Built by <a href="https://dexmetal.com">DexMetal LLC</a>.</p>
  <h2>Available Tools</h2>
  <ul>
    <li><code>get_competent_authority</code> — Look up a country's Basel CA by code or name</li>
    <li><code>list_competent_authorities</code> — List all 182 Basel Convention CAs</li>
    <li><code>check_api_health</code> — Check server status</li>
  </ul>
  <h2>Connect via Claude Desktop</h2>
  <pre>{
  "mcpServers": {
    "basel-ca": {
      "url": "https://mcp.dexmetal.com/sse"
    }
  }
}</pre>
  <p>SSE endpoint: <a href="https://mcp.dexmetal.com/sse">https://mcp.dexmetal.com/sse</a></p>
  <p>Health: <a href="https://mcp.dexmetal.com/health">https://mcp.dexmetal.com/health</a></p>
  <p style="margin-top:48px; font-size:0.85rem; color:#888;">© DexMetal LLC · <a href="https://dexmetal.com">dexmetal.com</a></p>
</body>
</html>`);
    });

    app.get("/health", (req, res) => {
      res.json({ status: "ok", service: "basel-mcp" });
    });

    app.listen(MCP_PORT, () => {
      console.log(`Basel CA API MCP Server (SSE) running on port ${MCP_PORT}`);
    });
  } else {
    // STDIO: single server, connect once
    const server = createMcpServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Basel CA API MCP Server running on stdio");
  }
}

main().catch((error) => {
  console.error("Error starting MCP server:", error);
  process.exit(1);
});
