const ts = require('typescript');
const uglify = require('uglify-js');
const fs = require('fs');
const path = require('path');
const sha256 = require('sha256');
const { groupBy } = require('lodash');

const { readSource, generateUniqFunctionName, getFunctionDefinitions } = require('./utils');

const replaceDuplicateDefinitions1 = ({
    code,
    functions,
    hashes: uniqFunctionsHashes,
    existingVariables: varNames,
    verboseOutput,
}) => {
    const nameMapping = {};
    const uniqFunctionsCode = [];
    const oldMapping = {};

    uniqFunctionsHashes.forEach(hash => {
        const func = functions.find(({ hash: h }) => h === hash);

        if (!func) {
            return;
        }

        const uniqName = generateUniqFunctionName(varNames);
        varNames.add(uniqName);

        if (verboseOutput) {
            console.debug('Building a unique declaration for', uniqName, 'as', func.code);
        }

        const declaration = `${uniqName}=${func.code}`;
        uniqFunctionsCode.push(declaration);

        if (func.name) {
            if (verboseOutput) {
                console.debug('Will add backwards named function', func.name, 'to be replaced with', uniqName);
            }

            oldMapping[func.name] = uniqName;
        }

        nameMapping[hash] = uniqName;
    });

    const occurrences = functions
        .filter(({ hash }) => uniqFunctionsHashes.includes(hash))
        .filter(({ pos: [start1, end1] }, _, arr) => !arr.find(({ pos: [start2, end2] }) => start2 > start1 && end2 < end1));

    occurrences.reverse();

    // TODO: handle overlapping [start, end] ranges
    let newCode = occurrences.reduce((accCode, { hash, pos: [start, end], isDeclaration }) => {
        const uniqName = isDeclaration ? '' : nameMapping[hash];

        const before = accCode.substring(0, start);
        const after = accCode.substring(end);

        if (verboseOutput) {
            if (isDeclaration) {
                console.debug(`> Removing duplicate declaration (${start}..${end})`, accCode.substring(start, end), 'in favor of', nameMapping[hash]);
                console.debug(`>> original:`, accCode.substring(start, end));
            } else {
                console.debug(`> Replacing usage (${start}..${end})`, accCode.substring(start, end), 'with', uniqName);
                console.debug(`>> original:`, accCode.substring(start, end));
            }
        }

        return before + uniqName + after;
    }, code);

    const toBeRemoved = functions
        .filter(({ name }) => name in oldMapping);

    toBeRemoved.reverse();

    newCode = toBeRemoved.reduce((accCode, { name, pos: [start, end], isDeclaration }) => {
        const uniqName = isDeclaration ? '' : oldMapping[name];

        const before = accCode.substring(0, start);
        const after = accCode.substring(end);

        if (verboseOutput) {
            if (isDeclaration) {
                console.debug('> Removing old declaration occurrence of', name, 'in favor of', oldMapping[name]);
                console.debug(`>> original:`, accCode.substring(start, end));
            } else {
                console.debug('> Removing old usage occurrence of', name, 'in favor of', uniqName);
                console.debug(`>> original:`, accCode.substring(start, end));
            }
        }

        return before + uniqName + after;
    }, newCode);

    const oldReferences = Object.entries(oldMapping)
        .filter(([ oldName, newName ]) => !(newName in nameMapping))
        .map(([ oldName, newName ]) => {
            if (verboseOutput) {
                console.debug('> Adding backwards compatibility declaration for', oldName, 'mapping onto', newName);
            }

            return `${oldName}=${newName}`;
        });

    const uniqCode = `var ${[...uniqFunctionsCode, ...oldReferences].join(',')};${newCode}`;

    return uniqCode;
};

module.exports.replaceDuplicateDefinitions = ({
    sourceFilename,
    outputFilename,
    hashes,
    verboseOutput,
}) => {
    const originalCode = readSource(sourceFilename);

    const MAX_ITERATIONS = 1;

    let prevHashses = hashes;
    let prevFilename = sourceFilename;
    let prevCode = originalCode;
    let i = 0;

    while (i < MAX_ITERATIONS) {
        if (verboseOutput) {
            console.debug(`Optimization iteration ${i + 1}/${MAX_ITERATIONS}`);
        }

        const { functions, varNames } = getFunctionDefinitions(prevCode, prevFilename);

        const newCode = replaceDuplicateDefinitions1({
            code: prevCode,
            functions,
            existingVariables: varNames,
            hashes: prevHashses,
            verboseOutput,
        });

        if (newCode.length >= prevCode.length) {
            break;
        }

        i++;
        prevCode = newCode;
        prevFilename = outputFilename;
        prevHashses = prevHashses.filter(Boolean);

        fs.writeFileSync(outputFilename, prevCode, 'utf-8');
    }

    console.log(`Wrote uniq code to ${outputFilename}`);
};
