import * as vscode from 'vscode';

function findDuplicatesList(items: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  items.forEach((item) => {
    if (seen.has(item)) {
      duplicates.add(item);
    } else {
      seen.add(item);
    }
  });

  return Array.from(duplicates);
}

interface questionInputProps {
  qname: string;
  title: string;
  codes: Array<string> | null;
}

function tidyQuestionInput(input: string): questionInputProps {
  let items: any = input.trim();
  items = items.replace('\t', ' ');
  items = items.split('\n').map((line: string) => line.trim());
  items = items.filter((line: string) => line !== '').join('\n');

  let content = items.split('\n');
  const mainItem = content[0].split(' ');
  const qname = mainItem[0];
  const title = mainItem.slice(1).join(' ').replace(/"/g, '""');

  let codes = content.slice(1);
  if (codes.length === 0) {
    codes = null;
  }

  return { qname, title, codes };
}

type QuestionTypeProps =
  | 'radio'
  | 'checkbox'
  | 'text'
  | 'textarea'
  | 'info'
  | 'bool'
  | 'number'
  | 'float'
  | 'datepicker';

function getQtypes(qtype: QuestionTypeProps): string {
  switch (qtype) {
    case 'radio':
      return 'categorical [1..1]';

    case 'checkbox':
      return 'categorical [1..]';

    case 'text':
      return 'text [1..100]';

    case 'textarea':
      return 'text [1..400]';

    case 'info':
      return 'info';

    case 'bool':
      return 'boolean';

    case 'number':
      return 'long [0..99999]';

    case 'float':
      return 'double [0..99] precision(4) scale(2)';

    case 'datepicker':
      const today = new Date();
      // 현재 일, 월, 연도 추출
      const day = today.getDate();
      const month = today.getMonth() + 1; // 월은 0부터 시작하므로 +1 필요
      const year = today.getFullYear();
      return `date [1/1/1900..${month}/${day}/${year}]`;

    default:
      return 'categorical [1..1]';
  }
}

function metaDataSetting(
  qname: string,
  title: string,
  attributes: string | Array<string> | null,
  qtype: QuestionTypeProps
): string {
  let defaultType = getQtypes(qtype);

  let extra = '';
  if (qtype === 'text' && attributes === null) {
    extra = `\nstyle (
  Width="200px",
  Control(Type="SingleLineEdit")
)`;
  }

  let attributesText = attributes === null ? `` : `\n{\n\t${attributes}\n}`;
  let metaDataText = `'<${qname} type="${qtype}">
${qname} "${title}"${extra}
${defaultType}${attributesText}
'</${qname}>
`;
  return metaDataText;
}

type routingTypeProps = 'copy' | 'write';

function webRoutingSetting(
  mode: routingTypeProps,
  qname: string,
  title: string,
  attributes: string | Array<string> | null,
  qtype: QuestionTypeProps
): string | null {
  // let defaultType = getQtypes(qtype);
  let askType = 'ask()';
  if (qtype === 'info') {
    askType = 'show()';
  }
  let routingText = `'<${qname} type="${qtype}">
${qname}.${askType}
'</${qname}>
`;

  if (mode === 'copy') {
    // 클립보드에 텍스트 복사
    vscode.env.clipboard.writeText(routingText).then(() => {
      vscode.window.showInformationMessage(`${qname} Routing Copy`);
    });
    return null;
  } else {
    return routingText;
  }
}

function returnQuestionMeta(
  qtype: QuestionTypeProps,
  routingMode: routingTypeProps
) {
  (async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor found!');
      return;
    }

    const document = editor.document;
    const selections = editor.selections;
    const edit = new vscode.WorkspaceEdit();

    try {
      for (const selection of selections) {
        const input = document.getText(selection);
        const { qname, title, codes } = tidyQuestionInput(input);
        let attributes: any = null;
        if (codes !== null) {
          attributes = codes.join('\n\t');
        }

        let metadata = metaDataSetting(qname, title, attributes, qtype);
        let routing = webRoutingSetting(
          routingMode,
          qname,
          title,
          attributes,
          qtype
        );

        // if( routing === null ) { // routing write mode

        // }

        edit.replace(document.uri, selection, metadata);
      }

      // let webRouting = '';

      await vscode.workspace.applyEdit(edit);
    } catch (error: any) {
      vscode.window.showErrorMessage(
        `Make ${qtype} Question failed: ${error.message}`
      );
    }
  })(); // 이 부분에서 즉시 실행
}

function processText(input: string): string[] {
  // .replace(/"/g, '""')
  return input
    .replace(/\t+/g, ' ') // 탭을 공백으로 치환
    .replace(/\n +\n/g, '\n\n') // 공백으로 채워진 줄 제거
    .replace(/\n{2,}/g, '\n') // 여러 개의 연속된 빈 줄을 하나로 줄임
    .trim() // 양 끝 공백 제거
    .split('\n') // 줄바꿈으로 텍스트 분리
    .map((line) => line.trim()); // 각 줄 양 끝 공백 제거
}

// 기타 공통 함수
function isOtherSpecify(content: string): boolean {
  const lowerContent = content.toLowerCase();
  return (
    (lowerContent.includes('other') &&
      (lowerContent.includes('specify') ||
        lowerContent.includes('specific'))) ||
    (content.includes('기타') && content.includes('구체적'))
  );
}

// 중복 요소 검사
function checkDupeElement(checkText: string): string {
  const printCode: string[] = [];
  const printText: string[] = [];
  const lines = checkText.split('\n');

  lines.forEach((line) => {
    let trimText = line.trim();
    if (trimText) {
      // label 값 추출
      const codeMatch = trimText.match(/_\d+/);
      if (codeMatch) {
        printCode.push(codeMatch.toString());
      }

      // 텍스트 추출
      const textMatch = line.match(/"(.*)"/);
      if (textMatch) {
        const text = textMatch[1].trim().replace(/\s+/g, '').toUpperCase();
        printText.push(text);
      }
    }
  });

  // 중복 검사
  const duplicateLabels = findDuplicatesList(printCode);
  const duplicateTexts = findDuplicatesList(printText);

  let rawText = checkText;

  if (duplicateLabels.length > 0) {
    const dupLabel = duplicateLabels.join(', ');
    //vscode.window.showErrorMessage(`❌ ERROR Duplicate Label: ${dupLabel}`);
    rawText += `\n' ❌ ERROR Duplicate Label: ${dupLabel}`;
  }

  if (duplicateTexts.length > 0) {
    const dupText = duplicateTexts.join(', ');
    //vscode.window.showErrorMessage(`❌ ERROR Duplicate Text: ${dupText}`);
    rawText += `\n' ❌ ERROR Duplicate Text: ${dupText}`;
  }

  return rawText;
}

const isAlpha = (char: string): boolean => /^[a-zA-Z]+$/.test(char);
const isDigit = (char: string): boolean => /^[0-9]+$/.test(char);

// 공통 명령 실행 함수
const executeCommand = async () => {
  try {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor found!');
      return;
    }

    const document = editor.document;
    let selections = editor.selections;

    for (const selection of selections) {
      let text = document.getText(selection);
      if (!text) {
        text = '';
      }

      const lines = processText(text);

      let processedLines: any = [];

      lines.forEach((line, index) => {
        let code = index + 1;
        let content = line;
        content = content.replace(/"/g, '""').trim();
        let extra = '';

        if (isOtherSpecify(content)) {
          extra = ` (_${code} other text [1..])`;
        }

        let codeText = `\t_${code} \"${content}\"${extra}`;
        processedLines.push(codeText);
      });

      const outputText = processedLines.join(',\n');
      let updatedText = checkDupeElement(outputText);
      //updatedText = updatedText.replace(/&/g, '&amp;');

      editor.edit((editBuilder) => {
        editBuilder.replace(selection, updatedText);
      });
    }
  } catch (error: any) {
    console.error(error);
    vscode.window.showErrorMessage(`Error: ${error.message}`);
  }
};

export function activate(context: vscode.ExtensionContext) {
  // Switching Code & Label (ctrl+0)
  const changeLabelCode = vscode.commands.registerCommand(
    'dimensions-niq-package.changeLabelCode',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('No active editor found.');
        return;
      }

      const document = editor.document;
      const selections = editor.selections;

      try {
        for (const selection of selections) {
          const selectedText = document.getText(selection).trim();

          if (!selectedText) {
            vscode.window.showWarningMessage('No text selected.');
            continue;
          }

          // 줄별로 처리
          const lines = selectedText.split('\n').map((line) => line.trim());
          const filteredLines = lines.filter((line) => line !== '');

          const processedLines = filteredLines.map((line) => {
            const lastTabIndex = line.lastIndexOf('\t');
            const lastSpaceIndex = line.lastIndexOf(' ');

            if (lastTabIndex !== -1) {
              // 탭 기준으로 분리
              const content = line.slice(0, lastTabIndex).trim();
              const code = line.slice(lastTabIndex + 1).trim();
              if (/^\d+$/.test(code)) {
                return `${code}\t${content}`;
              }
            } else if (lastSpaceIndex !== -1) {
              // 공백 기준으로 분리
              const content = line.slice(0, lastSpaceIndex).trim();
              const code = line.slice(lastSpaceIndex + 1).trim();
              if (/^\d+$/.test(code)) {
                return `${code}\t${content}`;
              }
            }

            // 처리할 수 없는 경우 그대로 반환
            return line;
          });

          const outputText = processedLines.join('\n');

          await editor.edit((editBuilder) => {
            editBuilder.replace(selection, outputText);
          });
        }
      } catch (error: any) {
        console.error(error);
        vscode.window.showErrorMessage(
          `An error occurred while processing the command: ${error.message}`
        );
      }
    }
  );

  context.subscriptions.push(changeLabelCode);

  // makeCodesOrder (ctrl+1)
  const makeCodesOrder = vscode.commands.registerCommand(
    'dimensions-niq-package.makeCodesOrder',
    () => executeCommand() // includeValue: false
  );
  context.subscriptions.push(makeCodesOrder);

  // makeCodesMatchValue (ctrl+7)
  const makeCodesMatchValue = vscode.commands.registerCommand(
    'dimensions-niq-package.makeCodesMatchValue',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('No active editor found.');
        return;
      }

      const document = editor.document;
      const selections = editor.selections;

      try {
        for (const selection of selections) {
          const selectedText = document.getText(selection);

          if (!selectedText.trim()) {
            vscode.window.showWarningMessage('No text selected.');
            continue;
          }

          // 텍스트 정리 및 분리
          const lines = processText(selectedText);

          let output: any = [];
          lines.forEach((line) => {
            const match = line.match(/^(\d+)[.)]?\s+(.*)$/); // 숫자, 구분자, 내용 추출
            if (!match) {
              vscode.window.showWarningMessage(
                `Invalid format in line: ${line}`
              );
              return;
            }

            const ordinal = match[1].trim(); // 첫 번째 그룹: 번호
            let content = match[2].trim(); // 두 번째 그룹: 내용
            content = content.replace(/"/g, '""').trim();

            let extra = '';
            if (isOtherSpecify(content)) {
              extra = ` (_${ordinal} other text [1..])`;
            }

            // 출력 구성
            const formattedLine = `\t_${ordinal} \"${content}\"${extra}`;
            output.push(formattedLine);
          });

          // Join the array into a single string separated by commas
          output = output.join(',\n');

          // 중복 확인 및 결과 반영
          let updatedText = checkDupeElement(output);
          updatedText = updatedText.replace(/&/g, '&amp;');

          await editor.edit((editBuilder) => {
            editBuilder.replace(selection, updatedText);
          });
        }
      } catch (error: any) {
        console.error(error);
        vscode.window.showErrorMessage(
          `An error occurred while processing the command: ${error.message}`
        );
      }
    }
  );

  context.subscriptions.push(makeCodesMatchValue);

  // ctrl+r
  const makeRadio = vscode.commands.registerCommand(
    'dimensions-niq-package.makeRadio',
    () => {
      returnQuestionMeta('radio', 'copy');
    }
  );

  context.subscriptions.push(makeRadio);

  // ctrl+shift+c
  const makeCheckbox = vscode.commands.registerCommand(
    'dimensions-niq-package.makeCheckbox',
    () => {
      returnQuestionMeta('checkbox', 'copy');
    }
  );

  context.subscriptions.push(makeCheckbox);

  // ctrl+n
  const makeNumber = vscode.commands.registerCommand(
    'dimensions-niq-package.makeNumber',
    () => {
      returnQuestionMeta('number', 'copy');
    }
  );

  context.subscriptions.push(makeNumber);

  // ctrl+shift+f
  const makeFloat = vscode.commands.registerCommand(
    'dimensions-niq-package.makeFloat',
    () => {
      returnQuestionMeta('float', 'copy');
    }
  );

  context.subscriptions.push(makeFloat);

  // ctrl+t
  const makeText = vscode.commands.registerCommand(
    'dimensions-niq-package.makeText',
    () => {
      returnQuestionMeta('text', 'copy');
    }
  );

  context.subscriptions.push(makeText);

  // ctrl+shift+t
  const makeTextArea = vscode.commands.registerCommand(
    'dimensions-niq-package.makeTextArea',
    () => {
      returnQuestionMeta('textarea', 'copy');
    }
  );

  context.subscriptions.push(makeTextArea);

  // ctrl+i
  const makeInfo = vscode.commands.registerCommand(
    'dimensions-niq-package.makeInfo',
    () => {
      returnQuestionMeta('info', 'copy');
    }
  );

  context.subscriptions.push(makeInfo);

  // ctrl+sift+d
  const makeDatePicker = vscode.commands.registerCommand(
    'dimensions-niq-package.makeDatePicker',
    () => {
      returnQuestionMeta('datepicker', 'copy');
    }
  );

  context.subscriptions.push(makeDatePicker);
}

// This method is called when your extension is deactivated
export function deactivate() {}
