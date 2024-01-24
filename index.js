const { readSource, getFunctionDefinitions, getFunctionDefinitionsOverThreshold } = require('./utils');
const { analyzeFunctions } = require('./analysis');
const { getFunctionDefinitionsOverThreshold, replaceDuplicateDefinitions } = require('./optimizations');

const printHelp = () => {
    console.error('Incorrect command line options');
    console.log('Use node index.js <COMMAND> [arguments]');
    console.log('<COMMAND> is one of: analyze, optimize');
    console.log('Common arguments are:');
    console.log('  --output <filename>   - output filename');
    console.log('optimize mode arguments are:');
    console.log('  --hashes <hashes>     - comma-separated list of function hashes, as per the output of analysis');
    console.log('  --threshold <integer> - number of duplicate occurrences a function has to have to be replaced');
};

const sourceFilename = process.argv[2];
const command = process.argv[3];

const outputFilenameArgIdx = process.argv.findIndex(a => a === '--output');

if (command === 'analyze') {
    const analysisOutputFilename = outputFilenameArgIdx > -1 ? process.argv[outputFilenameArgIdx + 1] : 'analysis.json';

    const code = readSource(sourceFilename);
    const { functions } = getFunctionDefinitions(code, sourceFilename);

    analyzeFunctions(functions, analysisOutputFilename, sourceFilename);
} else if (command === 'optimize') {
    const duplicateThresholdArgIdx = process.argv.findIndex(a => a === '--threshold');
    const hashesArgIdx = process.argv.findIndex(a => a === '--hashes');

    const outputFilename = outputFilenameArgIdx > -1 ? process.argv[outputFilenameArgIdx + 1] : 'output.js';

    if (duplicateThresholdArgIdx > -1) {
        const code = readSource(sourceFilename);
        const { functions, varNames } = getFunctionDefinitions(code, sourceFilename);

        const duplicateThreshold = parseInt(process.argv[duplicateThresholdArgIdx + 1]);
        const uniqFunctionsHashes = getFunctionDefinitionsOverThreshold(functions, varNames, duplicateThreshold);

        console.log(`Functions with over ${duplicateThreshold} occurrences, to be replaced:`, uniqFunctionsHashes);

        replaceDuplicateDefinitions(outputFilename, code, functions, uniqFunctionsHashes, varNames);
    } else if (hashesArgIdx > -1) {
        const code = readSource(sourceFilename);
        const { functions, varNames } = getFunctionDefinitions(code, sourceFilename);

        const uniqFunctionsHashes = process.argv[hashesArgIdx + 1].trim().split(',');

        console.log('Functions to be replaced:', uniqFunctionsHashes);

        replaceDuplicateDefinitions(outputFilename, code, functions, uniqFunctionsHashes, varNames);
    } else {
        printHelp();
        process.exit(1);
    }
} else {
    printHelp();
    process.exit(1);
}
