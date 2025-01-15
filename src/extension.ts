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

function processText(input: string): string[] {
  return input
    .replace(`"`, `""`)
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
  const printLabel: string[] = [];
  const printText: string[] = [];
  const lines = checkText.split('\n');

  lines.forEach((line) => {
    if (line.trim()) {
      // label 값 추출
      const labelMatch = line.match(/label="([^"]+)"/);
      if (labelMatch) {
        printLabel.push(labelMatch[1]);
      }

      // 텍스트 추출
      const textMatch = line.match(/>([^<]+)</);
      if (textMatch) {
        const text = textMatch[1].trim().replace(/\s+/g, '').toUpperCase();
        printText.push(text);
      }
    }
  });

  // 중복 검사
  const duplicateLabels = findDuplicatesList(printLabel);
  const duplicateTexts = findDuplicatesList(printText);

  let rawText = checkText;

  if (duplicateLabels.length > 0) {
    const dupLabel = duplicateLabels.join(', ');
    //vscode.window.showErrorMessage(`❌ ERROR Duplicate Label: ${dupLabel}`);
    rawText += `<note>❌ ERROR Duplicate Label: ${dupLabel}</note>\n`;
  }

  if (duplicateTexts.length > 0) {
    const dupText = duplicateTexts.join(', ');
    //vscode.window.showErrorMessage(`❌ ERROR Duplicate Text: ${dupText}`);
    rawText += `<note>❌ ERROR Duplicate Text: ${dupText}</note>\n`;
  }

  return rawText;
}

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

  // makeColsMatchValueCommand (ctrl+7)
  const makeColsMatchValueCommand = vscode.commands.registerCommand(
    'dimensions-niq-package.makeColsMatchValueCommand',
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
            const content = match[2].trim(); // 두 번째 그룹: 내용

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

  context.subscriptions.push(makeColsMatchValueCommand);
}

// This method is called when your extension is deactivated
export function deactivate() {}
