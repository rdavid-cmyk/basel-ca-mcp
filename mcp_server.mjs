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
const API_KEY = process.env.BASEL_API_KEY || "bca_test_key"; // Set this in Railway environment variables as BASEL_API_KEY
const MCP_PORT = process.env.MCP_PORT || 3000;

// Initialize the MCP Server
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

// Define tools
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

// Configure Axios client with the API key
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "X-API-Key": API_KEY,
    "Content-Type": "application/json",
  },
});

// Implement tool execution
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

// Start the server
async function main() {
  const transportMode = process.env.MCP_TRANSPORT || "stdio"; // 'sse' or 'stdio'

  if (transportMode === "sse") {
    // Start SSE HTTP Server
    const app = express();
    app.use(cors());
    
    const transports = new Map();

    app.get("/sse", async (req, res) => {
      const transport = new SSEServerTransport("/message", res);
      const sessionId = transport.sessionId;
      transports.set(sessionId, transport);
      res.on("close", () => {
        transports.delete(sessionId);
        console.log(`SSE connection closed: ${sessionId}`);
      });
      await server.connect(transport);
      console.log(`New SSE connection established: ${sessionId}`);
    });

    app.post("/message", async (req, res) => {
      const sessionId = req.query.sessionId;
      const transport = transports.get(sessionId);
      if (transport) {
        await transport.handlePostMessage(req, res);
      } else {
        res.status(400).send("No active SSE connection for sessionId: " + sessionId);
      }
    });

    app.get("/health", (req, res) => {
      res.json({ status: "ok", service: "basel-mcp" });
    });
    
    app.listen(MCP_PORT, () => {
      console.log(`Basel CA API MCP Server (SSE) running on port ${MCP_PORT}`);
    });
  } else {
    // Start STDIO Server
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Basel CA API MCP Server running on stdio");
  }
}

main().catch((error) => {
  console.error("Error starting MCP server:", error);
  process.exit(1);
});
