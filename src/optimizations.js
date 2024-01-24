const ts = require('typescript');
const uglify = require('uglify-js');
const fs = require('fs');
const path = require('path');
const sha256 = require('sha256');
const { groupBy } = require('lodash');

const { readSource, generateUniqFunctionName, getFunctionDefinitions, getFunctionUsages } = require('./utils');

module.exports.replaceDuplicateDefinitions = ({
    sourceFilename,
    outputFilename,
    hashes: uniqFunctionsHashes,
    verboseOutput,
}) => {
    console.log('Stage 1 - remove duplicate declarations');

    const originalCode = readSource(sourceFilename);

    const { functions, varNames } = getFunctionDefinitions(originalCode, sourceFilename);

    const nameMapping = {};
    const uniqFunctionsCode = [];
    const oldMapping = {};
    const allReplacements = {};

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
    const stage1Code = occurrences.reduce((accCode, { hash, name, pos: [start, end], isDeclaration }) => {
        const uniqName = isDeclaration ? '' : nameMapping[hash];

        allReplacements[name] = nameMapping[hash];

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
    }, originalCode);

    fs.writeFileSync(outputFilename, stage1Code, 'utf-8');

    console.log(`Wrote intermediate code to ${outputFilename}`);

    // stage 2
    console.log('Stage 2 - remove old named declarations');

    const { functions: functions2 } = getFunctionDefinitions(stage1Code, outputFilename);

    const toBeRemoved = functions2.filter(({ name }) => name in oldMapping);

    toBeRemoved.reverse();

    const stage2Code = toBeRemoved.reduce((accCode, { name, pos: [start, end], isDeclaration }) => {
        const uniqName = isDeclaration ? '' : oldMapping[name];

        allReplacements[name] = oldMapping[name];

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
    }, stage1Code);

    const oldReferences = Object.entries(oldMapping)
        .map(([ oldName, newName ]) => {
            if (verboseOutput) {
                console.debug('> Adding backwards compatibility declaration for', oldName, 'mapping onto', newName);
            }

            return `${oldName}=${newName}`;
        });

    fs.writeFileSync(outputFilename, stage2Code, 'utf-8');

    console.log(`Wrote intermediate code to ${outputFilename}`);

    // stage 3
    console.log('Stage 3 - replace all function usages');

    const allFunctions = new Set(Object.keys(allReplacements));

    if (verboseOutput) {
        console.debug('Mappings for this stage:', allReplacements);
    }

    const { usages } = getFunctionUsages(stage2Code, outputFilename, allFunctions);

    usages.reverse();

    const stage3Code = usages.reduce((accCode, { name, pos: [start, end] }) => {
        const uniqName = (accCode.charAt(start) === ' ' ? ' ' : '') + allReplacements[name];

        const before = accCode.substring(0, start);
        const after = accCode.substring(end);

        if (verboseOutput) {
            console.debug('> Removing the usage of', name, 'in favor of', uniqName);
            console.debug(`>> original:`, accCode.substring(start, end));
        }

        return before + uniqName + after;
    }, stage2Code);

    const resultCode = `var ${[...uniqFunctionsCode, ...oldReferences].join(',')};${stage3Code}`;

    fs.writeFileSync(outputFilename, resultCode, 'utf-8');

    console.log(`Wrote optimized code to ${outputFilename}`);
};
