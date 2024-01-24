const { getFunctionDefinitionsOverThreshold } = require('./src/utils');
const { analyzeFunctions } = require('./src/analysis');
const { replaceDuplicateDefinitions } = require('./src/optimizations');

const printHelp = () => {
    console.log('Use node index.js <COMMAND> [arguments]');
    console.log('<COMMAND> is one of: analyze, optimize');
    console.log('Common arguments are:');
    console.log('  --output <filename>   - output filename');
    console.log('  --verbose             - verbose output');
    console.log('optimize mode arguments are:');
    console.log('  --hashes <hashes>     - comma-separated list of function hashes, as per the output of analysis');
    console.log('  --threshold <integer> - number of duplicate occurrences a function has to have to be replaced');
};

const command = process.argv[2];
const sourceFilename = process.argv[3];

const outputFilenameArgIdx = process.argv.findIndex(a => a === '--output');
const verboseOutput = process.argv.findIndex(a => a === '--verbose') > -1;

if (command === 'analyze') {
    const analysisOutputFilename = outputFilenameArgIdx > -1 ? process.argv[outputFilenameArgIdx + 1] : 'analysis.json';

    analyzeFunctions({
        outputFilename: analysisOutputFilename,
        sourceFilename,
        verboseOutput,
    });
} else if (command === 'optimize') {
    const duplicateThresholdArgIdx = process.argv.findIndex(a => a === '--threshold');
    const hashesArgIdx = process.argv.findIndex(a => a === '--hashes');

    const outputFilename = outputFilenameArgIdx > -1 ? process.argv[outputFilenameArgIdx + 1] : 'output.js';

    if (duplicateThresholdArgIdx > -1) {
        const duplicateThreshold = parseInt(process.argv[duplicateThresholdArgIdx + 1]);
        const uniqFunctionsHashes = getFunctionDefinitionsOverThreshold({
            sourceFilename,
            threshold: duplicateThreshold,
        });

        console.log(`Functions with over ${duplicateThreshold} occurrences, to be replaced:`, uniqFunctionsHashes);

        replaceDuplicateDefinitions({
            outputFilename,
            sourceFilename,
            hashes: uniqFunctionsHashes,
            verboseOutput,
        });
    } else if (hashesArgIdx > -1) {
        const uniqFunctionsHashes = process.argv[hashesArgIdx + 1].trim().split(',');

        console.log('Functions to be replaced:', uniqFunctionsHashes);

        replaceDuplicateDefinitions({
            outputFilename,
            sourceFilename,
            hashes: uniqFunctionsHashes,
            verboseOutput,
        });
    } else {
        printHelp();
        process.exit(1);
    }
} else {
    console.error(`Incorrect command '${command}'`);

    printHelp();
    process.exit(1);
}
