import type { RuleConfig } from "@codemod.com/jssg-types/main";
import type { SgRoot } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import isMSWCall from "../utils/is-msw-calls.ts";

async function transform(root: SgRoot<TSX>): Promise<string> {
  let rootNode = root.root();
  const edits: any[] = [];

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

  let arrowFunctions = rootNode.findAll({
    rule: {
      any: [
        {
          kind: "arrow_function",
          pattern: "async $PARAMS => $BLOCK",
          inside: {
            kind: "arguments",
            inside: {
              kind: "call_expression",
              has: {
                kind: "member_expression",
                pattern: "$MEMBER",
              },
            },
          },
        },
        {
          kind: "arrow_function",
          pattern: "$PARAMS => $BLOCK",
          inside: {
            kind: "arguments",
            inside: {
              kind: "call_expression",
              has: {
                kind: "member_expression",
                pattern: "$MEMBER",
              },
            },
          },
        },
      ],
    },
  });

  let newImports = "";

  arrowFunctions.forEach((arr) => {
    if (
      !isMSWCall(
        arr.getMatch("MEMBER")?.text() ?? "",
        "msw",
        "http",
        rootNode
      ) &&
      !isMSWCall(
        arr.getMatch("MEMBER")?.text() ?? "",
        "msw",
        "graphql",
        rootNode
      )
    )
      return;
    let prms = arr.getMatch("PARAMS");
    let paramsText = prms?.text() ?? "";
    let params = paramsText
      .substring(1, paramsText.length - 1)
      .split(",") as string[];
    let ctxParam = params[2];
    ctxParam = ctxParam?.replace(/[{}]/g, "") ?? "";
    ctxParam = ctxParam.trim();
    let resParam = params[1];
    resParam = resParam?.replace(/[{}]/g, "") ?? "";
    resParam = resParam.trim();
    let block = arr.getMatch("BLOCK");
    if (resParam) {
      let response = block?.findAll({
        rule: {
          kind: "call_expression",
          pattern: `${resParam}($$$CONTENT)`,
        },
      });
      response?.forEach((res) => {
        let content = res.getMultipleMatches("CONTENT");
        let delay = "";
        let responseType = "text";
        let headers: Record<string, string> = {};
        let status = "";
        let responseContent = "";
        let cookies: string[][] = [];
        let data = "";
        let errors = "";
        let extensions = "";
        content.forEach((c) => {
          if (c.text() == ",") return;
          // delay
          let isDelay = c.find({
            rule: {
              kind: "call_expression",
              pattern: `${ctxParam}.delay($CONTENT)`,
            },
          });
          if (isDelay) {
            delay = isDelay.getMatch("CONTENT")?.text() ?? "";
          }
          // status
          let isStatus = c.find({
            rule: {
              kind: "call_expression",
              pattern: `${ctxParam}.status($CONTENT)`,
            },
          });
          if (isStatus) {
            status = isStatus.getMatch("CONTENT")?.text() ?? "";
          }
          // headers
          let isHeaders = c.findAll({
            rule: {
              kind: "call_expression",
              pattern: `${ctxParam}.set($NAME, $CONTENT)`,
            },
          });
          isHeaders.forEach((head) => {
            let name = head.getMatch("NAME")?.text() ?? "";
            let content = head.getMatch("CONTENT")?.text() ?? "";
            if (
              name.substring(1, name.length - 1).toLowerCase() == "content-type"
            ) {
              let responseType = {
                "text/plain": "text",
                "text/html": "html",
                "application/xml": "xml",
                "application/octet-stream": "arrayBuffer",
                "application/json": "json",
              }[content.substring(1, content.length - 1).toLowerCase()];
              responseType =
                typeof responseType === "undefined"
                  ? "text"
                  : responseType ?? "";
            }
            headers[`${name.substring(1, name.length - 1)}`] =
              content.substring(1, content.length - 1);
          });
          // cookies
          let isCokies = c.findAll({
            rule: {
              kind: "call_expression",
              pattern: `${ctxParam}.cookie($NAME, $CONTENT)`,
            },
          });
          isCokies.forEach((head) => {
            let name = head.getMatch("NAME")?.text() ?? "";
            let content = head.getMatch("CONTENT")?.text() ?? "";
            cookies.push([
              name.substring(1, name.length - 1),
              content.substring(1, content.length - 1),
            ]);
          });
          // if it's text
          let isText = c.find({
            rule: {
              kind: "call_expression",
              pattern: `${ctxParam}.text($CONTENT)`,
            },
          });
          if (isText) {
            let c = isText.getMatch("CONTENT")?.text() ?? "";
            responseContent = c;
            responseType = "text";
          }
          let isBody = c.find({
            rule: {
              kind: "call_expression",
              pattern: `${ctxParam}.body($CONTENT)`,
            },
          });
          if (isBody) {
            let c = isBody.getMatch("CONTENT")?.text() ?? "";
            responseContent = c;
          }
          // if it's json
          let isJson = c.find({
            rule: {
              kind: "call_expression",
              pattern: `${ctxParam}.json($CONTENT)`,
            },
          });
          if (isJson) {
            let c = isJson.getMatch("CONTENT")?.text() ?? "";
            responseContent = c;
            responseType = "json";
          }
          // if it's json
          let isData = c.find({
            rule: {
              kind: "call_expression",
              pattern: `${ctxParam}.data($CONTENT)`,
            },
          });
          let isErrors = c.find({
            rule: {
              kind: "call_expression",
              pattern: `${ctxParam}.errors($CONTENT)`,
            },
          });
          let isExtensions = c.find({
            rule: {
              kind: "call_expression",
              pattern: `${ctxParam}.extensions($CONTENT)`,
            },
          });
          if (isData || isErrors || isExtensions) {
            if (isData) {
              data = isData.getMatch("CONTENT")?.text() ?? "";
            } else if (isErrors) {
              errors = isErrors.getMatch("CONTENT")?.text() ?? "";
            } else if (isExtensions) {
              extensions = isExtensions.getMatch("CONTENT")?.text() ?? "";
            }
            responseType = "json";
          }
        });
        let newBlock = arr.text();
        if (delay) {
          if (hasMswImport) {
            const importMatch = hasMswImport.getMatch("IMPORTS");
            let importText = importMatch?.text() ?? "";
            if (
              importText[0] == "{" &&
              importText[importText.length - 1] == "}"
            ) {
              importText =
                importText.substring(0, importText.length - 1) + ", delay}";
            } else {
              importText += "{delay}";
            }
            edits.push(hasMswImport.replace(`import ${importText} from "msw"`));
          } else {
            let newRoot = `import { delay } from "msw"; \n ${rootNode.text()}`;
            edits.push(rootNode.replace(newRoot));
          }
          newBlock = `async ${paramsText} {\n  await delay(500); ${block
            ?.text()
            .substring(1)}`;
        }
        if (cookies.length) {
          let textCookies = "";
          cookies.forEach((cookie) => {
            textCookies += `${cookie[0]}=${cookie[1]};`;
          });
          headers["Set-Cookie"] = textCookies as string;
        }
        let secParam = `{${status ? `status: ${status},\n` : ""}${
          Object.keys(headers).length
            ? `headers: ${JSON.stringify(headers)},\n`
            : ""
        }}`;
        let thirdParam = `${data ? `data: ${data},\n` : ""}${
          errors ? `errors: ${errors},\n` : ""
        }${extensions ? `extensions: ${extensions},` : ""}`;

        newBlock = newBlock.replace(
          res.text(),
          `HttpResponse.${responseType}(\n${
            responseContent ? `${responseContent},\n` : ""
          }${thirdParam != "{}" ? thirdParam : ""}${
            secParam != "{}" ? secParam : ""
          })`
        );

        edits.push(arr.replace(newBlock));
      });
    }
  });

  if (arrowFunctions.length && edits.length) {
    let haveHttpResponse = rootNode.findAll({
      rule: {
        kind: "import_statement",
        has: {
          kind: "import_clause",
          has: {
            kind: "named_imports",
            has: {
              kind: "import_specifier",
              has: {
                kind: "identifier",
                pattern: "HttpResponse",
              },
            },
          },
        },
      },
    });
    if (!haveHttpResponse.length) {
      if (hasMswImport) {
        const importMatch = hasMswImport.getMatch("IMPORTS");
        let importText = importMatch?.text() ?? "";
        if (importText[0] == "{" && importText[importText.length - 1] == "}") {
          importText =
            importText.substring(0, importText.length - 1) + ", HttpResponse}";
        } else {
          importText += "{HttpResponse}";
        }
        edits.push(hasMswImport.replace(`import ${importText} from "msw"`));
      } else {
        newImports = `import { HttpResponse } from "msw"; \n`;
      }
    }
  }

  let newSource = rootNode.text();
  if (edits.length) {
    newSource = rootNode.commitEdits(edits);
    newSource = `${newImports}${newSource}`;
  }
  return newSource;
}

export function getSelector(): RuleConfig<TSX> {
  return {
    rule: {
      any: [
        {
          kind: "arrow_function",
          pattern: "async $PARAMS => $BLOCK",
          inside: {
            kind: "arguments",
            inside: {
              kind: "call_expression",
              has: {
                kind: "member_expression",
                pattern: "$MEMBER",
              },
            },
          },
        },
        {
          kind: "arrow_function",
          pattern: "$PARAMS => $BLOCK",
          inside: {
            kind: "arguments",
            inside: {
              kind: "call_expression",
              has: {
                kind: "member_expression",
                pattern: "$MEMBER",
              },
            },
          },
        },
      ],
    },
  };
}

export default transform;
