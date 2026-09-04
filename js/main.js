HIGHSCORE_KEY = "gorillionaireHighscores";
HIGHSCORE_LIMIT = 10;

class EventBus {
	#listners = {};

	on(event, fn){
		(this.#listners[event] ??= []).push(fn);
	}
	emit(event, data) {
		this.#listners[event]?.forEach(fn => fn(data));
	}
}

class AwareObject {
	constructor(eventBus) {
		this.bus = eventBus;
	}
}

class ActiveElement {
	constructor(element, eventBus) {
		this.el = element;
		this.bus = eventBus;
	}

}

class QuestionText extends ActiveElement {
	constructor(element, eventBus) {
		super(element, eventBus);
		this.bus.on("NewQuestion", ({question}) => {
			this.el.textContent = `${question.question}`;
		});
	}
}

class QuestionNum extends ActiveElement {
	constructor(element, eventBus) {
		super(element, eventBus);
		this.bus.on("NewQuestion", ({question, rem}) => {
			this.el.textContent = `${11 - rem} / 10`;
		});
	}
}

class CashoutButton extends ActiveElement {
	constructor(element, eventBus) {
		super(element, eventBus);
		this.el.disabled = true;
		this.el.addEventListener("click", () => {
			this.bus.emit("Cashout", {message: "Pääsit pakoon banaanien kanssa!"});
		});
		this.bus.on("ScoreChanged", ({newScore}) => {
			if(newScore > -1) {
				this.el.disabled = false;
			} else {
				this.el.disabled = true;
			}
		});
	}
}

class ChoiceLabel extends ActiveElement {
	static correctAnswer = "";
	static locked = false;
	constructor(element, eventBus, num) {
		super(element, eventBus);
		this.num = num;
		this.el.addEventListener("click", () => {
			if(ChoiceLabel.locked) {
				return;
			}
			ChoiceLabel.locked = true;
			setTimeout(() => {
				const res = this.el.textContent === ChoiceLabel.correctAnswer;
				this.colorIndicate(res);
				this.bus.emit("Answer", {result: res});
			}, 1000);
		});
		this.bus.on("NewQuestion", ({question}) => {
			this.setColors("", "");
			this.el.textContent = `${question.choices[this.num]}`;
			ChoiceLabel.correctAnswer = `${question.correctAnswer}`;
			ChoiceLabel.locked = false;
		});
	}
	colorIndicate(result) {
		if(result === true) {
			this.setColors("green", "black");
		} else {
			this.setColors("red", "black");
		}
		setTimeout(() => {
			this.setColors("","");
			this.bus.emit("LabelReady", {});
		}, 1000)
	}
	setColors(bc, c) {
		this.el.style.backgroundColor = bc;
		this.el.style.color = c;
	}
}

class ScoreBoard extends ActiveElement{
	static scoreValues = [];
	constructor(element, eventBus) {
		super(element, eventBus);
		ScoreBoard.scoreValues = Array.from(this.el, li => li.textContent);
		this.bus.on("ScoreChanged", ({newScore}) => {
			this.el.forEach((li, i) => {
				li.textContent = ScoreBoard.scoreValues[i];
				if (i === newScore) {
					li.textContent = `🍌 ${li.textContent} 🍌`;
					li.style.transform = "scale(1.3)";
					setTimeout(() => {
						li.style.transform = "scale(1.0)";
						this.bus.emit("BoardReady", {newScore});
					},300)
				}
			});
		});
	}
	static getValueAt(index) {
		return ScoreBoard.scoreValues[index];
	}
}

class Score extends AwareObject {
	static ins;
	constructor(eventBus, scoreBoard) {
		super(eventBus);
		Score.ins = this;
		this.result = null;
		this.currentScoreIndex = -1;
		this.bus.on("Answer", ({result}) => {
			if(this.result === null) {
				this.result = result;
			} else {
				this.setIndex(result);
				this.result = null;
			}
		});
		this.bus.on("LabelReady", () => {
			if(this.result === null) {
				this.result = true;
			} else {
				this.setIndex(this.result);
				this.result = null;
			}
		});
		this.bus.on("ResetQuiz", ({}) => {
			this.setIndex(false);
		});
	}
	setIndex(result) {
		if(result) {
			this.currentScoreIndex++;
		} else {
			this.currentScoreIndex = -1;
		}
		this.bus.emit("ScoreChanged", {newScore: this.currentScoreIndex});
	}
	static getIndex() {
		return Score.ins.currentScoreIndex;
	}
}

class HighScoreBoard extends ActiveElement {
	constructor(element, eventBus) {
		super(element, eventBus);
		this.bus.on("HighList", ({highList}) => {
			const ul = this.el;
			if (!ul) return;
			ul.innerHTML = "";
			if(highList.length === 0) {
				const li = document.createElement("li");
				li.textContent = "Ei voittoja vielä.";
				ul.appendChild(li);
				return;
			}

			highList.forEach((entry, idx) => {
				const li = document.createElement("li");
				li.textContent = `${idx + 1}. ${entry.name} - ${entry.bananas} 🍌`;
				ul.appendChild(li);
			});
		});
	}
}

class HighScore extends AwareObject {
		static ins;
		constructor(eventBus) {
			super(eventBus);
			HighScore.ins = this;
			this.bus.emit("HighList", {highList: this.pull()});
		}

		pull() {
			const raw = localStorage.getItem(HIGHSCORE_KEY);
			const list = JSON.parse(raw || "[]");
			return Array.isArray(list) ? list : [];
		}

		static register(name, bananas) {
			const entry = { name: name.trim(), bananas: String(bananas).trim() };
			const list = HighScore.ins.pull();
			list.push(entry);
			list.sort((a, b) => HighScore.ins.#parse(b.bananas) - HighScore.ins.#parse(a.bananas));
			localStorage.setItem(
				HIGHSCORE_KEY,
				JSON.stringify(list.slice(0, HIGHSCORE_LIMIT))
			);
			HighScore.ins.bus.emit("HighList", {highList: list});
		}

		#parse(text) {
			return parseInt(String(text).replace(/\s/g, ""), 10) || 0;
		}
}

class EndHandler extends AwareObject {
	constructor(eventBus) {
		super(eventBus);
		this.bus.on("Cashout", ({message}) => {
			this.cashOut(message);
		});

		this.bus.on("MaxScore", () => {
			this.cashOut("Sinusta tuli gorillionääri!");
		});
	}
	cashOut(message) {
		let name = prompt(`${message}\nSyötä nimesi: `);
		if(name != null) {
			name = name === "" ? "default" : name;
			const index = Score.getIndex();
			const bananas = ScoreBoard.getValueAt(index);
			HighScore.register(name, bananas);
		}
		this.bus.emit("ResetQuiz", {});
	}
}

class Questions extends AwareObject {
	static questions = [];
	constructor(eventBus) {
		super(eventBus);
	}
	async fetchQuestions() {
		const response = await fetch("questions.json");
		if(response.ok) {
			Questions.questions = await response.json();
			this.bus.emit("QuestionsReady", {source: this});
		} else {
		}
	}
	static getQuestions() {
		return structuredClone(Questions.questions);
	}
}

class QuestionDispencer extends AwareObject {
	#questions = [];
	question = "";
	#waitFor;
	constructor(eventBus) {
		super(eventBus);
		this.waitFor = null;
		this.bus.on("QuestionsReady", ({source}) => {
			this.reload();
		});
		this.bus.on("BoardReady", ({newScore}) => {
			if(newScore === HIGHSCORE_LIMIT - 1) {
				this.bus.emit("MaxScore", {});
			} else {
				this.newQuestion();
			}
		});
		this.bus.on("ScoreChanged", ({newScore}) => {
			if(newScore === -1) {
				this.reload();
			}
		});
		this.bus.on("ResetQuiz", ({}) => {
			this.reload();
		});
	}
	newQuestion() {
		const len = this.#questions.length;
		const nq = Math.floor(Math.random() * len);
		this.question = this.#questions.splice(nq, 1)[0];
		this.bus.emit("NewQuestion", {question: this.question, rem: len});
	}
	reload() {
		this.#questions = Questions.getQuestions();
		this.newQuestion();
	}
}

quizBus = new EventBus();

choice1 = new ChoiceLabel(
	document.querySelectorAll(".question-grid div")[0],
	quizBus,
	0
);

choice2 = new ChoiceLabel(
	document.querySelectorAll(".question-grid div")[1],
	quizBus,
	1
);

choice3 = new ChoiceLabel(
	document.querySelectorAll(".question-grid div")[2],
	quizBus,
	2
);

choice4 = new ChoiceLabel(
	document.querySelectorAll(".question-grid div")[3],
	quizBus,
	3
);

questionNum = new QuestionNum(
	document.querySelector(".question-number"),
	quizBus,
);

questionText = new QuestionText(
	document.querySelector(".question-text"),
	quizBus,
);

endHandler = new EndHandler(quizBus);
score = new Score(quizBus);
scoreBoard = new ScoreBoard(document.querySelectorAll(".bananas-list li"), quizBus);
highScoreBoard = new HighScoreBoard(document.querySelector(".highscores-list"), quizBus);
highScore = new HighScore(quizBus);
cashoutButton = new CashoutButton(document.querySelector(".cashout-button"), quizBus);
questions = new Questions(quizBus);
questionDispencer = new QuestionDispencer(quizBus);

document.getElementById("clear-highscores-hotspot").addEventListener("click", () => {
	localStorage.removeItem(HIGHSCORE_KEY);
});
document.addEventListener("DOMContentLoaded", () => {
	questions.fetchQuestions();
});

