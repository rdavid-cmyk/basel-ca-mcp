# Basel CA MCP Server

MCP server providing Basel Convention Competent Authority data for 182 countries.

## Tools
- `get_competent_authority` — retrieve CA details by country code or name
- `list_competent_authorities` — list all 182 Basel Convention CAs
- `check_api_health` — check API status

## Connect
SSE endpoint: https://mcp.dexmetal.com/sse

## Usage (Claude Desktop)
Add to claude_desktop_config.json:
```json
{
  "mcpServers": {
    "basel-ca": {
      "url": "https://mcp.dexmetal.com/sse"
    }
  }
}
```

## About
Built by DexMetal LLC — Basel Convention compliance platform. https://dexmetal.com
