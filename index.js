const ts = require('typescript');
const uglify = require('uglify-js');
const fs = require('fs');
const path = require('path');
const sha256 = require('sha256');
const { groupBy, sum } = require('lodash');

const parseFile = (sourceFilename) => {
    console.log(`Reading code from file ${sourceFilename}...`);

    const code = fs.readFileSync(sourceFilename).toString();

    console.log(`Parsing file ${sourceFilename}...`);

    const root = ts.createSourceFile(
        sourceFilename,
        code,
        ts.ScriptTarget.ESNext,
        /* setParentNodes */ true
    );

    const functions = [];

    const minifyOptions = {
        expression: true,
    };

    const parse = (node) => {
        if (ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isFunctionDeclaration(node)) {
            const body = code.substring(node.pos, node.end);
            const minCode = uglify.minify(body, minifyOptions);

            functions.push({
                name: node.name && node.name.text,
                code: minCode.code,
                pos: [node.pos, node.end],
                length: node.end - node.pos,
                // node,
            });
        }

        ts.forEachChild(node, child => {
            parse(child);
        });
    };

    parse(root);

    return functions;
};

const processFunctions = (functions, outputFilename, sourceFilename = undefined) => {
    console.log('Analyzing code...');

    const hashedFunctions = functions.map((fn) => ({ ...fn, hash: sha256(fn.code) }));

    const uniqueFunctions = groupBy(hashedFunctions, 'hash');

    const analysis = Object.entries(uniqueFunctions)
        .map(([_, duplicates]) => ({
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

const sourceFilename = process.argv[2];
const outputFilename = process.argv[3] || 'output.json';

if (fs.lstatSync(sourceFilename).isDirectory()) {
    const files = fs.readdirSync(sourceFilename);

    const functions = [];

    Promise.all(
        files.map((file) => new Promise((res, _) => {
            const fns = parseFile(path.join(sourceFilename, file));

            fns.forEach((fn) => functions.push(fn));

            res(true);
        }))
    )
    .then(() => {
        processFunctions(functions, outputFilename);
    });
} else {
    const functions = parseFile(sourceFilename);

    processFunctions(functions, outputFilename, sourceFilename);
}
