#!/usr/bin/env bun
/**
 * Auto-generated bootstrap script
 * Runs once after git clone to setup project correctly
 * This file will self-delete after successful execution
 */

const fs = require('fs');
const { execFileSync } = require('child_process');

const PROJECT_NAME = "medscribe-clinical-hrqxnx1_3mmjivkqlahk9";
const BOOTSTRAP_MARKER = '.bootstrap-complete';

// Check if already bootstrapped
if (fs.existsSync(BOOTSTRAP_MARKER)) {
    console.log('✓ Bootstrap already completed');
    process.exit(0);
}

console.log('🚀 Running first-time project setup...\n');

try {
    // Update package.json
    updatePackageJson();
    
    // Update wrangler.jsonc if exists
    updateWranglerJsonc();
    
    // Run setup commands
    runSetupCommands();
    
    // Mark as complete
    fs.writeFileSync(BOOTSTRAP_MARKER, new Date().toISOString());
    
    // Self-delete
    fs.unlinkSync(__filename);
    
    console.log('\n✅ Bootstrap complete! Project ready.');
} catch (error) {
    console.error('❌ Bootstrap failed:', error.message);
    console.log('You may need to manually update package.json and wrangler.jsonc');
    process.exit(1);
}

function updatePackageJson() {
    try {
        const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        pkg.name = PROJECT_NAME;
        
        // Remove prepare script after bootstrap
        if (pkg.scripts && pkg.scripts.prepare) {
            delete pkg.scripts.prepare;
        }

        // Strip trust escalations that would let a dependency's postinstall scripts run
        // unprompted on the victim's machine after clone (VEC-B).
        delete pkg.trustedDependencies;
        if (pkg.pnpm) {
            delete pkg.pnpm.onlyBuiltDependencies;
            delete pkg.pnpm.neverBuiltDependencies;
        }
        
        fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
        console.log('✓ Updated package.json with project name: ' + PROJECT_NAME);
    } catch (error) {
        console.error('Failed to update package.json:', error.message);
        throw error;
    }
}

function updateWranglerJsonc() {
    if (!fs.existsSync('wrangler.jsonc')) {
        console.log('⊘ wrangler.jsonc not found, skipping');
        return;
    }
    
    try {
        let content = fs.readFileSync('wrangler.jsonc', 'utf8');
        content = content.replace(/"name"\s*:\s*"[^"]*"/, `"name": "${PROJECT_NAME}"`);
        fs.writeFileSync('wrangler.jsonc', content);
        console.log('✓ Updated wrangler.jsonc with project name: ' + PROJECT_NAME);
    } catch (error) {
        console.warn('⚠️  Failed to update wrangler.jsonc:', error.message);
    }
}

function runSetupCommands() {
    const commandArgvs = [
    [
        "bun",
        "add",
        "@elevenlabs/elevenlabs-js"
    ]
];
    const ALLOWED = new Set(['npm', 'yarn', 'pnpm', 'bun']);
    
    if (commandArgvs.length === 0) {
        console.log('⊘ No setup commands to run');
        return;
    }
    
    console.log('\n📦 Running setup commands...\n');
    
    let successCount = 0;
    let failCount = 0;
    
    for (const argv of commandArgvs) {
        const [file, ...args] = argv;
        console.log(`▸ ${argv.join(' ')}`);
        if (!ALLOWED.has(file)) {
            failCount++;
            console.warn(`⚠️  Skipping disallowed command: ${file}`);
            continue;
        }
        try {
            execFileSync(file, args, {
                stdio: 'inherit',
                shell: false,
                cwd: process.cwd()
            });
            successCount++;
        } catch (error) {
            failCount++;
            console.warn(`⚠️  Command failed: ${argv.join(' ')}`);
            console.warn(`   Error: ${error.message}`);
        }
    }
    
    console.log(`\n✓ Commands completed: ${successCount} successful, ${failCount} failed\n`);
}
