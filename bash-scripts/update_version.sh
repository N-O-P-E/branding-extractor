#!/bin/bash
# Usage: ./update_version.sh <new_version>
# FORMAT IS <0.0.0>

if [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  find . -name 'package.json' -not -path '*/node_modules/*' -exec node -e "
    const fs = require('fs');
    const path = process.argv[1];
    const version = process.argv[2];
    const content = fs.readFileSync(path, 'utf8');
    const pkg = JSON.parse(content);
    pkg.version = version;
    // Preserve original indentation (detect from first indent)
    const indent = content.match(/^[ \t]+/m)?.[0] || '  ';
    fs.writeFileSync(path, JSON.stringify(pkg, null, indent) + '\n');
  " {} "$1" \;

  echo "Updated versions to $1";
else
  echo "Version format <$1> isn't correct, proper format is <0.0.0>";
fi
