const fs = require('fs');
const path = require('path');
const glob = require('glob');

const files = glob.sync('app/api/**/[*]/**/route.ts').concat(glob.sync('app/api/**/[*]/route.ts'));

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let modified = false;

  // Fix params type
  if (content.includes('params }: { params: { id: string } }')) {
    content = content.replace(
      /{ params }: { params: { id: string } }/g,
      '{ params }: { params: Promise<{ id: string }> }'
    );
    modified = true;
  }

  // Add await params extraction if params.id is used
  if (content.includes('params.id') && !content.includes('const { id } = await params')) {
    // Find the function start and add the await params line
    content = content.replace(
      /(export async function \w+\([^)]+\) \{[\s\S]*?)(const session = await getServerSession\(\))/,
      (match, p1, p2) => {
        return p1 + '    const { id } = await params\n' + p2;
      }
    );
    
    // Replace all params.id with id
    content = content.replace(/params\.id/g, 'id');
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Fixed: ${file}`);
  }
});

