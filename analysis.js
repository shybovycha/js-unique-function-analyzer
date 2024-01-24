const fs = require('fs');
const { groupBy, sum } = require('lodash');

module.exports.analyzeFunctions = (functions, outputFilename, sourceFilename = undefined) => {
    console.log('Analyzing code...');

    const uniqueFunctions = groupBy(functions, 'hash');

    const analysis = Object.entries(uniqueFunctions)
        .map(([hash, occurrences]) => ({
            hash,
            code: occurrences[0].code,
            duplicates: occurrences.length - 1,
            length: sum(occurrences.sort((a, b) => a.length - b.length).slice(1).map(({ length }) => length)) // leave the shortest version aside and count the duplicate chars for the rest
        }))
        .filter(({ duplicates }) => duplicates > 0)
        .sort((a, b) => b.duplicates - a.duplicates);

    const duplicateLength = sum(Object.values(analysis).map(({ length }) => length));

    console.log(`Found ${functions.length} functions, ${Object.keys(uniqueFunctions).length} are unique (${Math.round((Object.keys(uniqueFunctions).length / functions.length) * 10000.0) / 100}%)`);

    if (!!sourceFilename) {
        const code = fs.readFileSync(sourceFilename).toString();
        console.log(`Duplicates length: ${duplicateLength} bytes out of ${code.length} bytes are duplicate code (${Math.round((duplicateLength / code.length) * 10000.0) / 100}%)`);
    } else {
        console.log(`Duplicates length: ${duplicateLength} bytes`);
    }

    fs.writeFileSync(outputFilename, JSON.stringify(analysis, null, '  '), 'utf-8');

    console.log(`Wrote analysis results to ${outputFilename}`);
};
