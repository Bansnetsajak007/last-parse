import * as fs from "fs";
import {SentenceDetails} from "../detailsHolder/sentenceDetails";
import confirm from "@inquirer/confirm";
import {correctorRetType, handleCorrection} from "./correctionHandler";
import {configType} from "../configTypeAndDefaults";
import {SentencePainter} from "../errorHandler/errorHandler";

const comments = [
	{ext: ".html", cmtSt: "<!--", cmtEnd: "-->"},
	{ext: ".ejs", cmtSt: "<!--", cmtEnd: "-->"},
	// {ext: ".jsx", cmtSt: "{/*", cmtEnd: "*/}"},
	// {ext: ".tsx", cmtSt: "{/*", cmtEnd: "*/}"},
];

const testComment = (line: string[], stOrEnd: string, currPos: number) => {
	let chunk = "";
	for (let i = 0; i < stOrEnd.length; i++) {
		chunk += line[currPos + i];
	}
	return chunk === stOrEnd;
};

export async function updateFile(fileName: string, userConfig: configType) {
	const chunkSentence: SentenceDetails[] = [];
	const fileContent: string[] = [];
	let prevAngleBracket: '<'| null = null;

	const fileCmt = comments.find((cmtDet) => fileName.endsWith(cmtDet.ext)) || { cmtSt: '', cmtEnd: ''};
	const {cmtSt, cmtEnd} = fileCmt;

	const fileDatas = fs.readFileSync(fileName).toString().split("\n");

	let inBrackets= true;
	let skip = false;
	let storeStartPos = true;
	let contentStPos = -1;
	let contentEndPos = -1;
	let lineNum = 0;

	for await (const line of fileDatas) {
		let textContent = "";
		lineNum++;
		const currLine = line.split("");
		fileContent.push(line);

		for (let currPos = 0; currPos < currLine.length; currPos++) {
			const char = currLine[currPos];

			// comment checker
			skip = !skip
				? testComment(currLine, cmtSt, currPos)
				: !testComment(currLine, cmtEnd, currPos);
			if (skip) continue;

			// brackets checker
			if (char === "<") {
				prevAngleBracket = char;
				inBrackets = true;
				contentEndPos = currPos - 1;

				if (textContent) {
					chunkSentence.push(
						new SentenceDetails(
							textContent,
							contentStPos,
							contentEndPos,
							lineNum
						)
					);
					textContent = "";
				}
			} else if (char === ">") {
				if (prevAngleBracket!=='<') continue;
				prevAngleBracket = null;
				inBrackets = false;
				storeStartPos = true;
				continue;
			}

			if (!inBrackets) {
				if (storeStartPos) {
					if (/\s/.test(char)) continue;
					contentStPos = currPos;
					storeStartPos = false;
				}
				if (textContent != "") {
					textContent += char;
				} else textContent += /\s/.test(char) ? "" : char;
			}

			// if end of line and contains text, remove
			if (!currLine[currPos + 1] && textContent) {
				chunkSentence.push(
					new SentenceDetails(textContent.replace("\r",''), contentStPos, currPos, lineNum)
				);
			}
		}
	}

	// console.log(chunkSentence)

	for (const sentence of chunkSentence) {
		let replacer: correctorRetType = {text: sentence.content};
		let prevReplacer: string = sentence.content;

		do {
			prevReplacer = replacer.text;
			// Checking of each sentence and words and provide feedback accordingly
			replacer = await handleCorrection(
				replacer.text,
				userConfig.languageConfig
			);
		} while (replacer.text !== prevReplacer);
		// noErr Continue
		if (sentence.content === replacer.text) continue;
		// Error?
		console.log(
			SentencePainter.redSquiggleText(sentence.content) +
				"  =>  " +
				SentencePainter.greenSquiggleText(replacer.text)
		);

		if (!userConfig.autoReplace) {
			// asks user to can i replace.
			const canReplace: boolean = await confirm({
				message: "Contradict the sentence? ",
			});

			if (canReplace) {
				fileContent[sentence.lineNum - 1] = fileContent[
					sentence.lineNum - 1
				].replace(sentence.content, replacer.text);
			}
			console.clear();
		} else {
			fileContent[sentence.lineNum - 1] = fileContent[
				sentence.lineNum - 1
			].replace(sentence.content, replacer.text);
		}
	}

	fs.writeFile(fileName, fileContent.join("\n"), (err) => {
		if (err) {
			console.log(err);
		}
	});
}
