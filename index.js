const ts = require('typescript');
const uglify = require('uglify-js');
const fs = require('fs');
const path = require('path');
const sha256 = require('sha256');
const { groupBy, sum } = require('lodash');

const readSource = (sourceFilename) => {
    console.log(`Reading code from file ${sourceFilename}...`);

    return fs.readFileSync(sourceFilename).toString();
};

const parseFile = (code, sourceFilename) => {
    console.log(`Parsing file ${sourceFilename}...`);

    const root = ts.createSourceFile(
        sourceFilename,
        code,
        ts.ScriptTarget.ESNext,
        /* setParentNodes */ true
    );

    const functions = [];
    const varNames = new Set();

    const minifyOptions = {
        expression: true,
    };

    const parse = (node) => {
        if (ts.isFunctionExpression(node)) {
            node.parameters.forEach(({ name: parameterName }) => {
                if (ts.isIdentifier(parameterName)) {
                    varNames.add(parameterName.escapedText);
                } else if (ts.isObjectBindingPattern(parameterName)) {
                    parameterName.elements.forEach(({ name: bindingName }) => {
                        varNames.add(bindingName.escapedText);
                    })
                }
            });
        }

        if (ts.isArrowFunction(node)) {
            node.parameters.forEach(({ name: { escapedText: varName } }) => {
                varNames.add(varName);
            });
        }

        if (ts.isFunctionDeclaration(node)) {
            varNames.add(node.name.escapedText); // function name

            node.parameters.forEach(({ name: parameterName }) => {
                if (ts.isIdentifier(parameterName)) {
                    varNames.add(parameterName.escapedText);
                } else if (ts.isObjectBindingPattern(parameterName)) {
                    parameterName.elements.forEach(({ name: bindingName }) => {
                        varNames.add(bindingName.escapedText);
                    })
                }
            });
        }

        if (ts.isVariableDeclaration(node)) {
            varNames.add(node.name.escapedText)
        }

        if (ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isFunctionDeclaration(node)) {
            const body = code.substring(node.pos, node.end);
            const minCode = uglify.minify(body, minifyOptions);

            functions.push({
                name: node.name && node.name.text,
                code: minCode.code,
                pos: [node.pos, node.end],
                length: node.end - node.pos,
                hash: sha256(minCode.code),
                isDeclaration: ts.isFunctionDeclaration(node),
                // node,
            });
        }

        ts.forEachChild(node, child => {
            parse(child);
        });
    };

    parse(root);

    return { functions, varNames };
};

const processFunctions = (functions, outputFilename, sourceFilename = undefined) => {
    console.log('Analyzing code...');

    const uniqueFunctions = groupBy(functions, 'hash');

    const analysis = Object.entries(uniqueFunctions)
        .map(([hash, duplicates]) => ({
            hash,
            code: duplicates[0].code,
            duplicates: duplicates.length,
            length: sum(duplicates.sort((a, b) => a.length - b.length).slice(1).map(({ length }) => length)) // leave the shortest version aside and count the duplicate chars for the rest
        }))
        .sort((a, b) => b.duplicates - a.duplicates);

    const duplicateLength = sum(Object.values(analysis).map(({ length }) => length));

    console.log(`Found ${functions.length} functions`);
    console.log(`${Object.keys(uniqueFunctions).length} are unique (${Math.round((Object.keys(uniqueFunctions).length / functions.length) * 10000.0) / 100}%)`);

    if (!!sourceFilename) {
        const code = fs.readFileSync(sourceFilename).toString();
        console.log(`Duplicates length: ${duplicateLength} bytes out of ${code.length} bytes are duplicate code (${Math.round((duplicateLength / code.length) * 10000.0) / 100}%)`);
    } else {
        console.log(`Duplicates length: ${duplicateLength} bytes`);
    }

    fs.writeFileSync(outputFilename, JSON.stringify(analysis, null, '  '), 'utf-8');

    console.log(`Wrote analysis results to ${outputFilename}`);
};

const generateUniqFunctionName = (varNames) => {
    const g = function*() {
        const a = 'abcdefghijklmnopqrstuvwxyz$'.split('');
        const b = '0123456789'.split('');
        const c = a.concat(b);
        const l = a.length - 1;
        const k = c.length - 1;
        let r = [0];
        while (true) {
            yield r.map(x => c[x]).join('');

            if (r[0] === l && r.slice(1).every(x => x === k)) {
                r = r.map(_ => 0).concat([0]);
            } else if (r[0] < l) {
                r[0]++;
            } else {
                r[r.slice(1).findIndex(x => x < k) + 1]++;
            }
        }
    };

    const g1 = g();

    let name = g1.next().value;

    while (varNames.has(name)) {
        name = g1.next().value;
    }

    return name;
};

const uniqFunctions = (outputFilename, code, functions, uniqFunctionsHashes, varNames) => {
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

const sourceFilename = process.argv[2];
const outputFilename = process.argv[3] || 'output.json';
const uniqFunctionsArgIdx = process.argv.findIndex(a => a === '--uniq');

// TODO: make this an interactive multi-pass process with user prompt for confirmation on what to replace next?
const code = readSource(sourceFilename);

const { functions, varNames } = parseFile(code, sourceFilename);

if (uniqFunctionsArgIdx == -1) {
    processFunctions(functions, outputFilename, sourceFilename);
} else {
    const uniqFunctionsHashes = process.argv[uniqFunctionsArgIdx + 1].trim().split(',');

    console.log('Functions to be replaced:', uniqFunctionsHashes);

    const uniqCodeFilename = path.parse(sourceFilename).name + '.uniq' + path.extname(sourceFilename);

    uniqFunctions(uniqCodeFilename, code, functions, uniqFunctionsHashes, varNames);
}
