# Deploy Templates

This directory contains template files used by the CLI deploy commands.

## Directory Structure

```text
deploy/
├── skills/                     # Skill templates for work directories
│   ├── js-skills/              # English templates
│   │   ├── CLAUDE.md
│   │   └── skills/
│   │       └── conversation-memory/
│   └── i18n/
│       └── zh/
│           └── js-skills/      # Chinese templates
│
└── user-server-modules/        # Server module templates
    └── demo-module/            # Example module
```

## Usage

These templates are deployed via the CLI commands:

### Deploy Skills

```bash
# Deploy built-in skills to work directories
deepseek-cowork deploy

# Deploy with Chinese templates
deepseek-cowork deploy --lang zh

# Deploy to specific work directory
deepseek-cowork deploy --target my-project

# Deploy custom skill from any path
deepseek-cowork deploy --from ./my-custom-skill --target my-project

# Check deployment status
deepseek-cowork deploy status
```

### Deploy Server Modules

```bash
# List available modules
deepseek-cowork module list

# Deploy a module
deepseek-cowork module deploy demo-module

# Deploy custom module from any path
deepseek-cowork module deploy my-module --from ./my-module-source

# Check deployed modules
deepseek-cowork module status

# Remove a deployed module
deepseek-cowork module remove demo-module
```

## Adding Custom Templates

### Adding a New Skill

1. Create a new directory under `skills/js-skills/skills/`
2. Add a `SKILL.md` file describing the skill
3. Add any scripts or resources needed

### Adding a New Server Module

1. Create a new directory under `user-server-modules/`
2. Add an `index.js` with a setup function:

```javascript
const { EventEmitter } = require('events');

function setupMyModuleService(options = {}) {
    class MyModuleService extends EventEmitter {
        setupRoutes(app) {
            app.get('/api/my-module/hello', (req, res) => {
                res.json({ message: 'Hello!' });
            });
        }
    }
    return new MyModuleService();
}

module.exports = { setupMyModuleService };
```

1. Optionally add `README.md` and `static/` directory

## Related

- CLI source: `packages/cli/`
- Deployer modules: `packages/cli/lib/deployer/`
