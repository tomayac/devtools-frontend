// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
const fs = require('fs');
const path = require('path');
const CleanCSS = require('clean-css');
const {writeIfChanged} = require('./ninja/write-if-changed.js');
const [, , buildTimestamp, isDebugString, legacyString, targetName, srcDir, targetGenDir, files] = process.argv;

const filenames = files.split(',');
const configFiles = [];
const cleanCSS = new CleanCSS();
const isDebug = isDebugString === 'true';
const isLegacy = legacyString === 'true';

for (const fileName of filenames) {
  let output = fs.readFileSync(path.join(srcDir, fileName), {encoding: 'utf8', flag: 'r'});
  output = output.replace(/\`/g, '\\\'');
  output = output.replace(/\\/g, '\\\\');

  const stylesheetContents = isDebug ? output : cleanCSS.minify(output).styles;

  let exportStatement;
  if (isLegacy) {
    exportStatement = `export default {
  cssContent: \`${stylesheetContents}\`
};`;
  } else {
    exportStatement = `const styles = new CSSStyleSheet();
styles.replaceSync(
\`${stylesheetContents}
/*# sourceURL=${fileName} */
\`);
export default styles;`;
  }

  const generatedFileName = `${fileName}${isLegacy ? '.legacy' : ''}.js`;
  const generatedFileLocation = path.join(targetGenDir, generatedFileName);
  const newContents = `// Copyright ${
      new Date(Number(buildTimestamp) * 1000).getUTCFullYear()} The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
// IMPORTANT: this file is auto generated. Please do not edit this file.
/* istanbul ignore file */
${exportStatement}
`;

  writeIfChanged(generatedFileLocation, newContents);

  configFiles.push(`\"${generatedFileName}\"`);
}

writeIfChanged(path.join(targetGenDir, `${targetName}-tsconfig.json`), `{
    "compilerOptions": {
        "composite": true,
        "outDir": "."
    },
    "files": [
        ${configFiles.join(',\n        ')}
    ]
}
`);