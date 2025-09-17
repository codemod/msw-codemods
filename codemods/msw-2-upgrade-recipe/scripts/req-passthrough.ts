import type { SgRoot } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";

async function transform(root: SgRoot<TSX>): Promise<string> {
  let rootNode = root.root();

  let edits: any[] = [];

  let hasMswImport = rootNode.find({
    rule: {
      any: [
        {
          kind: "import_statement",
          pattern: 'import $IMPORTS from "msw"',
        },
        {
          kind: "import_statement",
          pattern: "import $IMPORTS from 'msw'",
        },
      ],
    },
  });

  const memberExpression = rootNode.findAll({
    rule: {
      kind: "member_expression",
      pattern: "$REQ.passthrough",
    },
  });

  let newImports = "";
  if (memberExpression.length) {
    if (hasMswImport) {
      const importMatch = hasMswImport.getMatch("IMPORTS");
      let importText = importMatch?.text() ?? "";
      if (importText[0] == "{" && importText[importText.length - 1] == "}") {
        importText =
          importText.substring(0, importText.length - 1) + ", passthrough}";
      } else {
        importText += "{passthrough}";
      }
      edits.push(hasMswImport.replace(`import ${importText} from "msw"`));
    } else {
      newImports = `import { passthrough } from "msw"; \n`;
    }
  }

  memberExpression.forEach((ex) => {
    let req = ex.getMatch("REQ");
    let reqText = req?.text() ?? "";
    let exText = ex?.text() ?? "";
    exText = exText.replace(`${reqText}.`, "");
    edits.push(ex.replace(exText));
  });

  let newSource = rootNode.text();
  if (edits.length) {
    newSource = rootNode.commitEdits(edits);
    newSource = `${newImports}${newSource}`;
  }
  return newSource;
}

export default transform;
