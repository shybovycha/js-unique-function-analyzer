const ts = require("typescript");
const uglify = require('uglify-js');
const fs = require('fs');

console.log('Reading code from file', process.argv[2])

const code = fs.readFileSync(process.argv[2]).toString();

const minifyOptions = {
    expression: true,
};

// const code = `
// (function () {
//     const arbuz = (test) => {
//         function apple(t) {
//             function test () {
//                 return 'ttt';
//             }
//             return t + 3;
//         }
//         const aa = 1;
//         const b1 = () => 2;
//         // comment
//         return aa + b1() + apple(test);
//     }
//     return arbuz;
//  })();
// `;

const root = ts.createSourceFile(
    process.argv[2],
    code,
    ts.ScriptTarget.ESNext,
    /*setParentNodes */ true
);

const functions = [];

const parse = (node) => {
    if (ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isFunctionDeclaration(node)) {
        const body = code.substring(node.pos, node.end);
        const minCode = uglify.minify(body, minifyOptions);

        functions.push({
            name: node.name && node.name.text,
            code: minCode.code,
            // node,
        });
    }

    ts.forEachChild(node, child => {
        parse(child);
    });
};

parse(root);

// console.log(functions);
console.log(`Found ${functions.length} function`);

fs.writeFileSync('functions.json', JSON.stringify(functions), 'utf-8');
