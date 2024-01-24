const ts = require('typescript');
const uglify = require('uglify-js');
const fs = require('fs');
const path = require('path');
const sha256 = require('sha256');
const { groupBy } = require('lodash');

module.exports.replaceDuplicateDefinitions = (outputFilename, code, functions, uniqFunctionsHashes, varNames) => {
    const nameMapping = {};
    const uniqFunctionsCode = [];

    uniqFunctionsHashes.forEach(hash => {
        const func = functions.find(({ hash: h }) => h === hash);

        const uniqName = generateUniqFunctionName(varNames);
        varNames.add(uniqName);

        console.log('Building a unique declaration for', uniqName, 'as', func.code);

        const declaration = `${uniqName}=${func.code}`;
        uniqFunctionsCode.push(declaration);

        nameMapping[hash] = uniqName;
    });

    const occurrences = functions
        .filter(({ hash }) => uniqFunctionsHashes.includes(hash))
        .filter(({ pos: [start1, end1] }, _, arr) => !arr.find(({ pos: [start2, end2] }) => start2 > start1 && end2 < end1));

    occurrences.reverse();

    // TODO: handle overlapping [start, end] ranges
    const newCode = occurrences.reduce((accCode, { hash, pos: [start, end], isDeclaration }) => {
        const uniqName = isDeclaration ? '' : nameMapping[hash];

        const before = accCode.substring(0, start);
        const after = accCode.substring(end);

        if (isDeclaration) {
            console.log(`> Removing duplicate declaration (${start}..${end})`, accCode.substring(start, end), 'in favor of', nameMapping[hash]);
        } else {
            console.log(`> Replacing usage (${start}..${end})`, accCode.substring(start, end), 'with', uniqName);
        }

        return before + uniqName + after;
    }, code);

    let uniqCode = `var ${uniqFunctionsCode.join(',')};${newCode}`;

    fs.writeFileSync(outputFilename, uniqCode, 'utf-8');

    console.log(`Wrote uniq code to ${outputFilename}`);
};