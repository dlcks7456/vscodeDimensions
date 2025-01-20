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
${defaultType}${attributesText};
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

        if (routing !== null) {
          // routing write mode
          metadata = `${metadata}
${routing}`;
        }

        edit.replace(document.uri, selection, metadata);
      }

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

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function generateHtml(matches: string[]): string {
  const highlightJsCdn =
    'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/highlight.min.js';
  const highlightCssCdn =
    'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/styles/default.min.css';

  const formattedMatches = matches
    .map((m, i) => `<pre><code class="vb">${escapeHtml(m.trim())}</code></pre>`)
    .join('<hr>');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>XML Matches</title>
      <link rel="stylesheet" href="${highlightCssCdn}">
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        pre { background: #f5f5f5; padding: 10px; border-radius: 5px; }
        hr { margin: 20px 0; }
      </style>
    </head>
    <body>
      <h1>Search Question</h1>
      ${formattedMatches}
      <script src="${highlightJsCdn}"></script>
      <script>hljs.highlightAll();</script>
    </body>
    </html>
  `;
}

export function activate(context: vscode.ExtensionContext) {
  // Auto Suggestions Setting
  let provider = vscode.languages.registerCompletionItemProvider(
    { scheme: 'file', language: 'vb' },
    {
      provideCompletionItems(document, position, token, context) {
        let completionItems: vscode.CompletionItem[] = [];
        // 자동완성 목록 추가
        let suggestions: any = [];

        if (document.fileName.endsWith('.vb')) {
          const defaultVBCodes = [
            {
              label: 'Sub',
              detail: 'Creates a new Sub routine',
              insertText: new vscode.SnippetString(
                'Sub ${1:Name}()\n\t${2}\nEnd Sub'
              ),
            },
            {
              label: 'Function',
              detail: 'Creates a new Function',
              insertText: new vscode.SnippetString(
                'Function ${1:Name}() As ${2:Type}\n\t${3}\nEnd Function'
              ),
            },
            {
              label: 'If',
              detail: 'If statement',
              insertText: new vscode.SnippetString(
                'If ${1:condition} Then\n\t${2}\nEnd If'
              ),
            },
            {
              label: 'For',
              detail: 'For loop',
              insertText: new vscode.SnippetString(
                'For ${1:i} = ${2:1} To ${3:10}\n\t${4}\nNext'
              ),
            },
            {
              label: 'While',
              detail: 'While loop',
              insertText: new vscode.SnippetString(
                'While ${1:condition}\n\t${2}\nEnd While'
              ),
            },
            {
              label: 'DoWhile',
              detail: 'Do While loop',
              insertText: new vscode.SnippetString(
                'Do While ${1:condition}\n\t${2}\nLoop'
              ),
            },
            {
              label: 'SelectCase',
              detail: 'Select Case statement',
              insertText: new vscode.SnippetString(
                'Select Case ${1:expression}\n\tCase ${2:option1}\n\t\t${3}\n\tCase ${4:option2}\n\t\t${5}\n\tCase Else\n\t\t${6}\nEnd Select'
              ),
            },
            {
              label: 'TryCatch',
              detail: 'Try Catch block for error handling',
              insertText: new vscode.SnippetString(
                'Try\n\t${1}\nCatch ex As Exception\n\t${2}\nEnd Try'
              ),
            },
            {
              label: 'WithEnd',
              detail: 'With statement',
              insertText: new vscode.SnippetString(
                'With ${1:object}\n\t${2}\nEnd With'
              ),
            },
            {
              label: 'Dim',
              detail: 'Variable declaration',
              insertText: new vscode.SnippetString(
                'Dim ${1:variableName} As ${2:Type}'
              ),
            },
            {
              label: 'Const',
              detail: 'Constant declaration',
              insertText: new vscode.SnippetString(
                'Const ${1:constantName} As ${2:Type} = ${3:value}'
              ),
            },
            {
              label: 'Property',
              detail: 'Property definition',
              insertText: new vscode.SnippetString(
                'Public Property ${1:Name} As ${2:Type}\n\tGet\n\t\tReturn ${3}\n\tEnd Get\n\tSet(value As ${2:Type})\n\t\t${3} = value\n\tEnd Set\nEnd Property'
              ),
            },
            {
              label: 'MsgBox',
              detail: 'Display a message box',
              insertText: new vscode.SnippetString(
                'debug.MsgBox("${1:message}")'
              ),
            },
            {
              label: 'InputBox',
              detail: 'Get user input via an input box',
              insertText: new vscode.SnippetString(
                'Dim ${1:input} As String = InputBox("${2:Enter a value}")'
              ),
            },
            {
              label: 'DateNow',
              detail: 'Get current date and time',
              insertText: new vscode.SnippetString(
                'Dim ${1:currentDate} As Date = Now'
              ),
            },
            {
              label: 'Array',
              detail: 'Declare an array',
              insertText: new vscode.SnippetString(
                'Dim ${1:arrayName}(${2:10}) As ${3:Type}'
              ),
            },
            {
              label: 'ForEach',
              detail: 'For Each loop',
              insertText: new vscode.SnippetString(
                'For Each ${1:item} In ${2:collection}\n\t${3}\nNext'
              ),
            },
            {
              label: 'Module',
              detail: 'Create a new Module',
              insertText: new vscode.SnippetString(
                'Module ${1:ModuleName}\n\t${2}\nEnd Module'
              ),
            },
            {
              label: 'Class',
              detail: 'Create a new Class',
              insertText: new vscode.SnippetString(
                'Public Class ${1:ClassName}\n\t${2}\nEnd Class'
              ),
            },
            {
              label: 'ExitSub',
              detail: 'Exit Sub statement',
              insertText: new vscode.SnippetString('Exit Sub'),
            },
            {
              label: 'ExitFunction',
              detail: 'Exit Function statement',
              insertText: new vscode.SnippetString('Exit Function'),
            },
            {
              label: 'End',
              detail: 'Terminate program execution',
              insertText: new vscode.SnippetString('End'),
            },
          ];

          suggestions = suggestions.concat(defaultVBCodes);

          const dimensionsSuggestions = [
            {
              label: 'Ask',
              detail: 'Write / Read',
              insertText: new vscode.SnippetString('Ask()'),
            },
            {
              label: 'Show',
              detail: 'Read only',
              insertText: new vscode.SnippetString('Show()'),
            },
            {
              label: 'Categories',
              detail: '문항 카테고리',
              insertText: new vscode.SnippetString('Categories'),
            },
            {
              label: 'Order',
              detail: '로테이션 속성',
              insertText: new vscode.SnippetString('Order'),
            },
            {
              label: 'Filter',
              detail: '속성 필터',
              insertText: new vscode.SnippetString('Filter'),
            },
            {
              label: 'Response',
              detail: '응답 제어 관련',
              insertText: new vscode.SnippetString('Response'),
            },
            {
              label: 'Coded',
              detail: 'codes 응답',
              insertText: new vscode.SnippetString('Response.Coded'),
            },
            {
              label: 'Value',
              detail: '응답 값 불러오기',
              insertText: new vscode.SnippetString('Response.Value'),
            },
            {
              label: 'DefinedCategories',
              detail: '선언된 카테고리',
              insertText: new vscode.SnippetString('DefinedCategories()'),
            },
            {
              label: 'Label',
              detail: '라벨',
              insertText: new vscode.SnippetString('Label'),
            },
            {
              label: 'Inserts',
              detail: 'Insert',
              insertText: new vscode.SnippetString('Inserts[$0]'),
            },
            {
              label: 'Text',
              detail: 'Text',
              insertText: new vscode.SnippetString('Text'),
            },
            {
              label: 'Other',
              detail: 'Other',
              insertText: new vscode.SnippetString('Other[$0]'),
            },
            {
              label: 'oAscending',
              detail: '로테이션 ASC',
              insertText: new vscode.SnippetString('oAscending'),
            },
            {
              label: 'oDescending',
              detail: '로테이션 DESC',
              insertText: new vscode.SnippetString('oDescending'),
            },
            {
              label: 'oRandomize',
              detail: '로테이션 RAN',
              insertText: new vscode.SnippetString('oRandomize'),
            },
            {
              label: 'oReverse',
              detail: '로테이션 REV',
              insertText: new vscode.SnippetString('oReverse'),
            },
            {
              label: 'oRotate',
              detail: '로테이션 ROT',
              insertText: new vscode.SnippetString('oRotate'),
            },
            {
              label: 'oCustom',
              detail: '로테이션 CUSTOM',
              insertText: new vscode.SnippetString('oCustom'),
            },
            {
              label: 'cBoolean',
              detail: '(Conversion) 값을 Boolean 타입으로 변환',
              insertText: new vscode.SnippetString('cBoolean($0)'),
            },
            {
              label: 'cCategorical',
              detail: '(Conversion) 값을 Categorical 타입으로 변환',
              insertText: new vscode.SnippetString('cCategorical($0)'),
            },
            {
              label: 'cDate',
              detail: '(Conversion) 값을 Date 타입으로 변환',
              insertText: new vscode.SnippetString('cDate($0)'),
            },
            {
              label: 'cDouble',
              detail: '(Conversion) 값을 Double 타입으로 변환',
              insertText: new vscode.SnippetString('cDouble($0)'),
            },
            {
              label: 'cLong',
              detail: '(Conversion) 값을 Long 타입으로 변환',
              insertText: new vscode.SnippetString('cLong($0)'),
            },
            {
              label: 'cText',
              detail: '(Conversion) 값을 Text 타입으로 변환',
              insertText: new vscode.SnippetString('cText($0)'),
            },
            {
              label: 'AnswerCount',
              detail: '(Categorical) 선택된 카테고리 개수 반환',
              insertText: new vscode.SnippetString('AnswerCount($0)'),
            },
            {
              label: 'ContainsAll',
              detail: '(Categorical) 모든 지정된 카테고리가 포함되었는지 확인',
              insertText: new vscode.SnippetString('ContainsAll($0)'),
            },
            {
              label: 'ContainsAny',
              detail:
                '(Categorical) 하나 이상의 지정된 카테고리가 포함되었는지 확인',
              insertText: new vscode.SnippetString('ContainsAny($0)'),
            },
            {
              label: 'DefinedCategories',
              detail: '(Categorical) Metadata에 정의된 카테고리 리스트 반환',
              insertText: new vscode.SnippetString('DefinedCategories($0)'),
            },
            {
              label: 'Difference',
              detail: '(Categorical) 두 카테고리 리스트의 차집합 반환',
              insertText: new vscode.SnippetString('Difference($0)'),
            },
            {
              label: 'GetAnswer',
              detail: '(Categorical) 카테고리 리스트에서 특정 카테고리 반환',
              insertText: new vscode.SnippetString('GetAnswer($0)'),
            },
            {
              label: 'HasAnswer',
              detail: '(Categorical) 특정 카테고리가 리스트에 있는지 확인',
              insertText: new vscode.SnippetString('HasAnswer($0)'),
            },
            {
              label: 'Intersection',
              detail: '(Categorical) 두 리스트의 교집합 반환',
              insertText: new vscode.SnippetString('Intersection($0)'),
            },
            {
              label: 'Merge',
              detail: '(Categorical) 여러 카테고리 값의 합집합 반환',
              insertText: new vscode.SnippetString('Merge($0)'),
            },
            {
              label: 'Unique',
              detail: '(Categorical) 중복된 카테고리가 제거된 리스트 반환',
              insertText: new vscode.SnippetString('Unique($0)'),
            },
            {
              label: 'Find',
              detail:
                '(Text/Categorical/Array) 문자열, 리스트, 배열에서 특정 항목의 위치 반환',
              insertText: new vscode.SnippetString('Find($0)'),
            },
            {
              label: 'Left',
              detail:
                '(Text/Categorical/Array) 문자열, 리스트, 배열의 처음 몇 개 항목 반환',
              insertText: new vscode.SnippetString('Left($0)'),
            },
            {
              label: 'Len',
              detail:
                '(Text/Categorical/Array) 문자열, 리스트, 배열의 길이 반환',
              insertText: new vscode.SnippetString('Len($0)'),
            },
            {
              label: 'Format',
              detail: '(Text) 값을 지정된 스타일로 포맷팅',
              insertText: new vscode.SnippetString('Format($0)'),
            },
            {
              label: 'LCase',
              detail: '(Text) 문자열을 소문자로 변환',
              insertText: new vscode.SnippetString('LCase($0)'),
            },
            {
              label: 'Trim',
              detail: '(Text) 문자열 앞뒤 공백 제거',
              insertText: new vscode.SnippetString('Trim($0)'),
            },
            {
              label: 'GetRandomSeed',
              detail: '(Random) 랜덤 생성기의 현재 시작점 반환',
              insertText: new vscode.SnippetString('GetRandomSeed()'),
            },
            {
              label: 'Rnd',
              detail: '(Random) 랜덤 소수 반환',
              insertText: new vscode.SnippetString('Rnd($0)'),
            },
            {
              label: 'SortAsc',
              detail: '(List) 리스트를 오름차순으로 정렬',
              insertText: new vscode.SnippetString('SortAsc($0)'),
            },
            {
              label: 'Abs',
              detail: '(Calc) 숫자의 절댓값 반환',
              insertText: new vscode.SnippetString('Abs($0)'),
            },
            {
              label: 'MinOf',
              detail: '(Calc) 두 개 이상의 값 중 최소값 반환',
              insertText: new vscode.SnippetString('MinOf($0)'),
            },
            {
              label: 'IIf',
              detail: '(Other) 조건이 참이면 True 값, 거짓이면 False 값 반환',
              insertText: new vscode.SnippetString('IIf($0)'),
            },
            {
              label: 'IsEmpty',
              detail: '(Other) 값이 비어 있는지 확인',
              insertText: new vscode.SnippetString('IsEmpty($0)'),
            },
            {
              label: 'setTerminationsStatus',
              detail: 'Terminate Status',
              insertText: new vscode.SnippetString(
                'setTerminationsStatus(IOM, {_$1}, "$2")'
              ),
            },
            {
              label: 'section',
              detail: '(Block) Section',
              insertText: new vscode.SnippetString(
                'section ${1:sectionName}\n\t$0\nend section'
              ),
            },
          ];

          suggestions = suggestions.concat(dimensionsSuggestions);
        }

        // for mdd file
        else if (document.fileName.endsWith('.mdd')) {
          const mddFileSuggestions = [
            {
              label: 'categorical',
              detail: '(Question Type) 단수/복수 문항',
              insertText: new vscode.SnippetString('categorical [1..$0]'),
            },
            {
              label: 'text',
              detail: '(Question Type) 주관식 문항',
              insertText: new vscode.SnippetString('text [1..];'),
            },
            {
              label: 'info',
              detail: '(Question Type) 설명문 페이지',
              insertText: new vscode.SnippetString('info;'),
            },
            {
              label: 'boolean',
              detail: '(Question Type) true or false',
              insertText: new vscode.SnippetString('boolean;'),
            },
            {
              label: 'long',
              detail: '(Question Type) 정수 응답 문항',
              insertText: new vscode.SnippetString('long [${1:1}..${2:99}];'),
            },
            {
              label: 'double',
              detail: '(Question Type) 소수 응답 문항',
              insertText: new vscode.SnippetString(
                'double [${1:1}..${2:9}] precision(${3:3}) scale(${4:2});'
              ),
            },
            {
              label: 'date',
              detail: '(Question Type) 날짜 응답',
              insertText: new vscode.SnippetString(
                'date [${1:1/1/2011}..${2:5/01/2011}]'
              ),
            },
            {
              label: 'time',
              detail: '(Question Type) 시간 응답',
              insertText: new vscode.SnippetString(
                'date [${1:06:00pm}..${2:11:00pm}];'
              ),
            },
            {
              label: 'fix',
              detail: '(Rotation) 로테이션 고정',
              insertText: new vscode.SnippetString('fix'),
            },
            {
              label: 'exclusive',
              detail: '(Logic) Single Code',
              insertText: new vscode.SnippetString('exclusive'),
            },
            {
              label: 'nofilter',
              detail: '(Logic) Filter 제거',
              insertText: new vscode.SnippetString('nofilter'),
            },
            {
              label: 'canfilter',
              detail: '(Logic) Filter 사용',
              insertText: new vscode.SnippetString('canfilter'),
            },
            {
              label: 'rot',
              detail: '(Rotation) 로테이션',
              insertText: new vscode.SnippetString('rot'),
            },
            {
              label: 'ran',
              detail: '(Rotation) 랜덤',
              insertText: new vscode.SnippetString('ran'),
            },
            {
              label: 'rev',
              detail: '(Rotation) 역순',
              insertText: new vscode.SnippetString('rev'),
            },
            {
              label: 'asc',
              detail: '(Rotation) 오름차순',
              insertText: new vscode.SnippetString('asc'),
            },
            {
              label: 'desc',
              detail: '(Rotation) 내림차순',
              insertText: new vscode.SnippetString('desc'),
            },
            {
              label: 'DK',
              detail: '(Special Response) 모름 코드',
              insertText: new vscode.SnippetString('DK'),
            },
            {
              label: 'REF',
              detail: '(Special Response) 응답 거절',
              insertText: new vscode.SnippetString('REF'),
            },
            {
              label: 'NA',
              detail: '(Special Response) 무응답',
              insertText: new vscode.SnippetString('NA'),
            },
            {
              label: 'other',
              detail: '(Special Response) 기타',
              insertText: new vscode.SnippetString('other'),
            },
            {
              label: 'define',
              detail: '(Define List) 공유 리스트',
              insertText: new vscode.SnippetString(
                '${1:listName} "${2:listDesc}" define {\n\t${0}\n};'
              ),
            },
            {
              label: 'use',
              detail: '(Define List) 공유 리스트 사용',
              insertText: new vscode.SnippetString('use ${1:listName}'),
            },
            {
              label: 'codes',
              detail: '(Code) Text/Number 추가 코드',
              insertText: new vscode.SnippetString('codes {\n\t$0\n};'),
            },
            {
              label: 'precision',
              detail: '(Number) 소수점 뺀 입력 길이',
              insertText: new vscode.SnippetString('precision($0)'),
            },
            {
              label: 'scale',
              detail: '(Number) 소수 자리수',
              insertText: new vscode.SnippetString('scale($0)'),
            },
            {
              label: 'step',
              detail: '(Number) 등차 적용',
              insertText: new vscode.SnippetString('step ${1:10}'),
            },
            {
              label: 'verify',
              detail: '(Number) 응답 Range',
              insertText: new vscode.SnippetString('[1..100]'),
            },
            {
              label: 'style',
              detail: '(Style) Style',
              insertText: new vscode.SnippetString('style(\n\t$0\n\t)'),
            },
            {
              label: 'loop',
              detail: '(Loop) Loop',
              insertText: new vscode.SnippetString(
                '${1:loopName} "${2:QuestionText}" loop {\n\t$0\n} fields (\n\t\n) expand;'
              ),
            },
            {
              label: 'row',
              detail: '(Grid) Row (default)',
              insertText: new vscode.SnippetString('row'),
            },
            {
              label: 'column',
              detail: '(Grid) Column',
              insertText: new vscode.SnippetString('column'),
            },
            {
              label: 'expand',
              detail: '(Grid) Expand',
              insertText: new vscode.SnippetString('expand'),
            },
            {
              label: 'grid',
              detail: '(Grid) Grid',
              insertText: new vscode.SnippetString('grid'),
            },
          ];

          suggestions = suggestions.concat(mddFileSuggestions);
        }

        suggestions.forEach((suggestion: any) => {
          let item = new vscode.CompletionItem(
            suggestion.label,
            vscode.CompletionItemKind.Snippet
          );
          item.detail = suggestion.detail;
          item.insertText = suggestion.insertText;
          completionItems.push(item);
        });

        return completionItems;
      },
    }
  );

  context.subscriptions.push(provider);

  let routingWriteMode: routingTypeProps = 'copy';

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
      returnQuestionMeta('radio', routingWriteMode);
    }
  );

  context.subscriptions.push(makeRadio);

  // ctrl+shift+c
  const makeCheckbox = vscode.commands.registerCommand(
    'dimensions-niq-package.makeCheckbox',
    () => {
      returnQuestionMeta('checkbox', routingWriteMode);
    }
  );

  context.subscriptions.push(makeCheckbox);

  // ctrl+n
  const makeNumber = vscode.commands.registerCommand(
    'dimensions-niq-package.makeNumber',
    () => {
      returnQuestionMeta('number', routingWriteMode);
    }
  );

  context.subscriptions.push(makeNumber);

  // ctrl+shift+f
  const makeFloat = vscode.commands.registerCommand(
    'dimensions-niq-package.makeFloat',
    () => {
      returnQuestionMeta('float', routingWriteMode);
    }
  );

  context.subscriptions.push(makeFloat);

  // ctrl+t
  const makeText = vscode.commands.registerCommand(
    'dimensions-niq-package.makeText',
    () => {
      returnQuestionMeta('text', routingWriteMode);
    }
  );

  context.subscriptions.push(makeText);

  // ctrl+shift+t
  const makeTextArea = vscode.commands.registerCommand(
    'dimensions-niq-package.makeTextArea',
    () => {
      returnQuestionMeta('textarea', routingWriteMode);
    }
  );

  context.subscriptions.push(makeTextArea);

  // ctrl+i
  const makeInfo = vscode.commands.registerCommand(
    'dimensions-niq-package.makeInfo',
    () => {
      returnQuestionMeta('info', routingWriteMode);
    }
  );

  context.subscriptions.push(makeInfo);

  // ctrl+shift+d
  const makeDatePicker = vscode.commands.registerCommand(
    'dimensions-niq-package.makeDatePicker',
    () => {
      returnQuestionMeta('datepicker', routingWriteMode);
    }
  );

  context.subscriptions.push(makeDatePicker);

  // ctrl+shift+`
  const routingModeChange = vscode.commands.registerCommand(
    'dimensions-niq-package.routingModeChange',
    () => {
      if (routingWriteMode === 'copy') {
        routingWriteMode = 'write';
      } else if (routingWriteMode === 'write') {
        routingWriteMode = 'copy';
      }

      vscode.window.showInformationMessage(
        `📌 Routing Mode Change : ${routingWriteMode}`
      );
    }
  );

  // Search Question
  // ctrl+alt+f
  let currentPanel: vscode.WebviewPanel | undefined;

  let disposable = vscode.commands.registerCommand(
    'dimensions-niq-package.findMatchingLabel',
    async () => {
      const editor = vscode.window.activeTextEditor;

      if (!editor) {
        vscode.window.showErrorMessage('No active editor found.');
        return;
      }

      const document = editor.document;
      const selection = editor.selection;
      const selectedText = document.getText(selection);

      if (!selectedText) {
        vscode.window.showErrorMessage('No text selected.');
        return;
      }

      if (document.languageId !== 'vb') {
        vscode.window.showErrorMessage(
          'This command is only applicable to VB/MDD files.'
        );
        return;
      }

      const documentText = document.getText();
      const regex = new RegExp(
        `'<${selectedText}\\b[^>]*>([\\s\\S]*?)'</${selectedText}>`,
        'g'
      );
      let matches = [];
      let match;

      while ((match = regex.exec(documentText)) !== null) {
        matches.push(match[0]);
      }

      if (matches.length === 0) {
        vscode.window.showInformationMessage(
          `No matches found for label="${selectedText}".`
        );
        return;
      }

      const htmlContent = generateHtml(matches);

      if (currentPanel) {
        // Reuse existing panel
        currentPanel.webview.html = htmlContent;
        currentPanel.reveal(vscode.ViewColumn.One); // Bring the panel to the front
      } else {
        // Create a new panel
        currentPanel = vscode.window.createWebviewPanel(
          'xmlPreview',
          `Search Question`,
          vscode.ViewColumn.One,
          { enableScripts: true }
        );

        currentPanel.webview.html = htmlContent;

        // Handle panel disposal
        currentPanel.onDidDispose(() => {
          currentPanel = undefined;
        });
      }
    }
  );

  context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
