/**
 * Deprecated legacy server entry.
 *
 * The product runtime now uses LocalService via the CLI/Electron paths.
 * This file is kept only to provide a clear migration message for anyone
 * still trying to launch the old standalone server directly.
 */

function printDeprecationMessage() {
    console.error('server/index.js has been deprecated and is no longer a supported entry point.');
    console.error('');
    console.error('Use one of the following instead:');
    console.error('  - npm run server        # starts LocalService via CLI');
    console.error('  - npm run cli -- start  # starts LocalService explicitly');
    console.error('  - npm start             # launches the Electron app');
}

async function main() {
    printDeprecationMessage();
    process.exitCode = 1;
}

module.exports = {
    main
};

if (require.main === module) {
    main();
}
