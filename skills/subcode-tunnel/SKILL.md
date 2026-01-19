---
name: subcode-tunnel
description: Create public URLs for local development servers using Tailscale Funnel or Cloudflare Tunnels. Use this skill when the user asks to "share a URL", "create a tunnel", "expose a port", "get a public URL", or needs remote access to local dev servers. Handles auto-detection of available tunneling methods and port conflict resolution.
---

# Subcode Tunnel

Create public HTTPS URLs for local development servers. Supports both Tailscale Funnel and Cloudflare Tunnels with automatic detection.

## When to Use This Skill

- User asks for a "public URL" or "shareable link" to a dev server
- User wants to "expose" a local port to the internet
- User needs to access a dev server from a different device/network
- User asks to "create a tunnel" or "start a tunnel"
- User is working in a worktree and has port conflicts

## Quick Reference

```bash
# Check what tunneling options are available
.claude/skills/subcode-tunnel/scripts/tunnel.sh detect

# Create a tunnel (auto-selects best method)
.claude/skills/subcode-tunnel/scripts/tunnel.sh start <port> [name]

# Create tunnel with specific method
.claude/skills/subcode-tunnel/scripts/tunnel.sh start <port> [name] --method=cloudflare
.claude/skills/subcode-tunnel/scripts/tunnel.sh start <port> [name] --method=tailscale

# List active tunnels
.claude/skills/subcode-tunnel/scripts/tunnel.sh list

# Stop a tunnel
.claude/skills/subcode-tunnel/scripts/tunnel.sh stop <name>

# Stop all tunnels
.claude/skills/subcode-tunnel/scripts/tunnel.sh stop-all

# Find an available port (handles worktree conflicts)
.claude/skills/subcode-tunnel/scripts/tunnel.sh find-port <base-port>
```

## Tunneling Methods

### Priority Order

1. **Cloudflare Named Tunnel** - If authenticated and configured
   - Custom hostnames: `app-machine.yourdomain.com`
   - Unlimited tunnels per machine
   - Persistent configuration

2. **Tailscale Funnel** - If Tailscale is available
   - Hostnames: `machine.tailnet.ts.net` or `:8443`/`:10000`
   - Up to 3 tunnels per machine (ports 443, 8443, 10000)
   - Simple setup

3. **Cloudflare Quick Tunnel** - Fallback (no auth needed)
   - Random hostnames: `random-words.trycloudflare.com`
   - Ephemeral (URL changes each time)
   - Works without any account

## Workflow Instructions

### Creating a Tunnel

1. **Detect available methods:**
   ```bash
   .claude/skills/subcode-tunnel/scripts/tunnel.sh detect
   ```
   This returns JSON with available methods and their status.

2. **If multiple methods available**, ask user preference:
   - Cloudflare Named: Best for memorable URLs
   - Tailscale: Best for simplicity
   - Cloudflare Quick: Best for one-off sharing

3. **Start the tunnel:**
   ```bash
   .claude/skills/subcode-tunnel/scripts/tunnel.sh start 3000 web --method=cloudflare
   ```

4. **Share the URL** returned by the script.

### Handling Port Conflicts

When a port is already in use (common in worktrees):

1. **Find an available port:**
   ```bash
   .claude/skills/subcode-tunnel/scripts/tunnel.sh find-port 3000
   ```
   Returns the next available port (3001, 3002, etc.)

2. **Start the app on the new port**, then tunnel to it.

### Multi-App Tunneling

For multiple apps on the same machine:

**Cloudflare (recommended):**
```bash
# Each app gets its own subdomain
.claude/skills/subcode-tunnel/scripts/tunnel.sh start 3000 web
.claude/skills/subcode-tunnel/scripts/tunnel.sh start 8080 api
# Results: web-mymachine.yourdomain.com, api-mymachine.yourdomain.com
```

**Tailscale:**
```bash
# Uses different ports (443, 8443, 10000)
.claude/skills/subcode-tunnel/scripts/tunnel.sh start 3000 web --method=tailscale
.claude/skills/subcode-tunnel/scripts/tunnel.sh start 8080 api --method=tailscale
# Results: mymachine.tailnet.ts.net (443), mymachine.tailnet.ts.net:8443
```

## Configuration

### Cloudflare Named Tunnels

Requires one-time setup:
```bash
cloudflared tunnel login  # Select your domain
export CLOUDFLARE_TUNNEL_DOMAIN=yourdomain.com
```

The script auto-detects:
- Tunnel credentials in `~/.cloudflared/`
- Existing tunnel for this machine
- Domain from `CLOUDFLARE_TUNNEL_DOMAIN` environment variable

### Tailscale Funnel

Requires:
- Tailscale installed and connected
- Funnel enabled in Tailscale admin (usually automatic)

To avoid sudo prompts:
```bash
sudo tailscale set --operator=$USER
```

## Machine Naming

For Cloudflare tunnels, the machine name is detected from:
1. `$TUNNEL_MACHINE_NAME` environment variable
2. Tailscale hostname (if available)
3. System hostname

This name is used in URLs: `app-{machine}.domain.com`

## Troubleshooting

### "Port already in use"
Use `find-port` to get an available port, or check what's using it:
```bash
ss -tlnp | grep :3000
```

### "Cloudflare not authenticated"
Run `cloudflared tunnel login` and select your domain.

### "CLOUDFLARE_TUNNEL_DOMAIN required"
Set the environment variable to your Cloudflare domain:
```bash
export CLOUDFLARE_TUNNEL_DOMAIN=yourdomain.com
```

### "Tailscale funnel access denied"
Run `sudo tailscale set --operator=$USER` or use sudo.

### "No tunneling methods available"
Install either:
- `cloudflared` (recommended): https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/
- Tailscale: https://tailscale.com/download
