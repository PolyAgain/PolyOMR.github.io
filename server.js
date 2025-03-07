const express = require('express');
const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3000;

// Middleware to parse JSON and form data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (HTML, CSS)
app.use(express.static('public'));

// Function to calculate constants based on input
function calculateConstants(numQuestions) {
    const QUESTIONS_PER_COLUMN = 50; // Number of questions per column
    const NUM_COLUMNS = Math.ceil(numQuestions / QUESTIONS_PER_COLUMN); // Number of columns needed
    const MARGIN = 50;
    const BUBBLE_RADIUS = 10;
    const BUBBLE_SPACING = 30;
    const QUESTION_SPACING = 40;
    const FONT_SIZE = 15;
    const NUM_OPTIONS = 4;

    // Calculate sheet width and height
    const SHEET_WIDTH = MARGIN * 2 + NUM_COLUMNS * (200 + BUBBLE_SPACING * NUM_OPTIONS) + 300; // Extra space for stats column
    const SHEET_HEIGHT = MARGIN * 2 + QUESTIONS_PER_COLUMN * QUESTION_SPACING; // Adjust height based on questions per column

    return {
        SHEET_WIDTH,
        SHEET_HEIGHT,
        MARGIN,
        BUBBLE_RADIUS,
        BUBBLE_SPACING,
        QUESTION_SPACING,
        FONT_SIZE,
        NUM_OPTIONS,
        QUESTIONS_PER_COLUMN,
        NUM_COLUMNS,
    };
}

// Function to draw a bubble
function drawBubble(ctx, x, y, radius, color = 'black', filled = false) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.fillStyle = filled ? color : 'white';
    ctx.stroke();
    ctx.fill();
}

// Function to format question numbers with leading zeros
function formatQuestionNumber(q) {
    return q.toString().padStart(3, '0'); // Ensures 3 digits (e.g., 001, 010, 100)
}

// Parse the input answers
function parseAnswers(answerText) {
    const answers = {};
    answerText.trim().split('\n').forEach(line => {
        // Extract the question number and answer, ignoring any text before them
        const match = line.match(/(\d+)\.\s*([\d?\-])/);
        if (match) {
            const q = parseInt(match[1]); // Question number
            const answer = match[2].trim(); // Answer
            // Treat "?", "-", or empty as blank
            answers[q] = answer === '?' || answer === '-' || answer === '' ? null : parseInt(answer);
        }
    });
    return answers;
}

// Generate the OMR sheet
function generateOMRSheet(answers, answerKey, name, constants) {
    const {
        SHEET_WIDTH,
        SHEET_HEIGHT,
        MARGIN,
        BUBBLE_RADIUS,
        BUBBLE_SPACING,
        QUESTION_SPACING,
        FONT_SIZE,
        NUM_OPTIONS,
        QUESTIONS_PER_COLUMN,
        NUM_COLUMNS,
    } = constants;

    // Create a canvas
    const canvas = createCanvas(SHEET_WIDTH, SHEET_HEIGHT);
    const ctx = canvas.getContext('2d');

    // Set background to white
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, SHEET_WIDTH, SHEET_HEIGHT);

    let y = MARGIN;
    let column = 0; // Track the current column
    ctx.font = `${FONT_SIZE}px Arial`;

    // Counters for green, red, and yellow circles
    let greenCount = 0;
    let redCount = 0;
    let yellowCount = 0;

    // Find the maximum question number
    const maxQuestion = Math.max(...Object.keys(answers).map(Number), ...(answerKey ? Object.keys(answerKey).map(Number) : [0]));

    for (let q = 1; q <= maxQuestion; q++) {
        // Calculate the x position based on the current column
        const xOffset = MARGIN + column * (SHEET_WIDTH / (NUM_COLUMNS + 1)); // Divide the sheet into columns (+1 for stats column)

        // Draw formatted question number
        ctx.fillStyle = 'black';
        ctx.fillText(formatQuestionNumber(q), xOffset, y);

        // Draw bubbles for options (without numbers)
        let x = xOffset + 100;
        for (let option = 1; option <= NUM_OPTIONS; option++) {
            const userAnswer = answers[q] !== undefined ? answers[q] : null; // Treat missing questions as blank
            const correctAnswer = answerKey ? answerKey[q] : null;

            let color = 'black'; // Default color
            let filled = false;

            if (answerKey && correctAnswer !== undefined) {
                // If answer key is provided and has an answer for this question, use color-coding logic
                if (userAnswer === option) {
                    if (userAnswer === correctAnswer) {
                        color = 'green'; // Correct answer
                        greenCount++;
                    } else {
                        color = 'red'; // Incorrect answer
                        redCount++;
                    }
                    filled = true;
                } else if (correctAnswer === option && userAnswer === null) {
                    color = 'yellow'; // Blank answer (highlight correct answer)
                    yellowCount++;
                    filled = true;
                }
            } else {
                // If no answer key is provided or no answer for this question, use default behavior
                if (userAnswer === option) {
                    filled = true;
                }
            }

            drawBubble(ctx, x, y, BUBBLE_RADIUS, color, filled);
            x += BUBBLE_SPACING;
        }

        // Move to the next row
        y += QUESTION_SPACING;

        // Start a new column after every QUESTIONS_PER_COLUMN questions
        if (q % QUESTIONS_PER_COLUMN === 0) {
            y = MARGIN; // Reset y position for the new column
            column++; // Move to the next column
        }
    }

    // Draw the stats column
    const statsX = MARGIN + NUM_COLUMNS * (SHEET_WIDTH / (NUM_COLUMNS + 1)); // Position for the stats column
    const statsY = MARGIN;
    const statsSpacing = 30;

    // Draw a larger border around the stats region
    const statsWidth = 250; // Increased width for the stats column
    const statsHeight = 180; // Increased height for the stats region
    ctx.strokeStyle = 'black';
    ctx.strokeRect(statsX - 20, statsY - 20, statsWidth, statsHeight); // Increased padding around the stats

    // Green circle and count
    drawBubble(ctx, statsX, statsY, BUBBLE_RADIUS, 'green', true);
    ctx.fillStyle = 'black'; // Set text color to black
    ctx.fillText(`: ${greenCount}`, statsX + BUBBLE_RADIUS + 5, statsY + 5);

    // Red circle and count
    drawBubble(ctx, statsX, statsY + statsSpacing, BUBBLE_RADIUS, 'red', true);
    ctx.fillStyle = 'black'; // Set text color to black
    ctx.fillText(`: ${redCount}`, statsX + BUBBLE_RADIUS + 5, statsY + statsSpacing + 5);

    // Yellow circle and count
    drawBubble(ctx, statsX, statsY + 2 * statsSpacing, BUBBLE_RADIUS, 'yellow', true);
    ctx.fillStyle = 'black'; // Set text color to black
    ctx.fillText(`: ${yellowCount}`, statsX + BUBBLE_RADIUS + 5, statsY + 2 * statsSpacing + 5);

    // Calculate and display percentage if all questions have an answer key
    const totalQuestions = maxQuestion;
    const totalAnswerKey = answerKey ? Object.keys(answerKey).length : 0;
    if (totalAnswerKey === totalQuestions) {
        const percentage = ((3 * greenCount - redCount) / (3 * totalQuestions)) * 100;
        ctx.fillStyle = 'black'; // Set text color to black
        ctx.fillText(`Percentage: ${percentage.toFixed(2)}%`, statsX, statsY + 3 * statsSpacing);
    }

    // Display the name below the percentage
    if (name) {
        ctx.fillStyle = 'black'; // Set text color to black
        ctx.fillText(`Name: ${name}`, statsX, statsY + 4 * statsSpacing);
    }

    return canvas;
}

// Route to handle form submission
app.post('/generate', (req, res) => {
    const userAnswersInput = req.body.userAnswers;
    const answerKeyInput = req.body.answerKey;
    const name = req.body.name;

    // Parse the inputs
    const userAnswers = parseAnswers(userAnswersInput);
    const answerKey = answerKeyInput ? parseAnswers(answerKeyInput) : null;

    // Calculate constants based on the number of questions
    const numQuestions = Math.max(...Object.keys(userAnswers).map(Number), ...(answerKey ? Object.keys(answerKey).map(Number) : [0]));
    const constants = calculateConstants(numQuestions);

    // Generate the OMR sheet
    const canvas = generateOMRSheet(userAnswers, answerKey, name, constants);

    // Save the image as a PNG file
    const filePath = path.join(__dirname, 'omr_sheet.png');
    const out = fs.createWriteStream(filePath);
    const stream = canvas.createPNGStream();
    stream.pipe(out);
    out.on('finish', () => {
        // Send the file as a response
        res.download(filePath, 'omr_sheet.png', (err) => {
            if (err) {
                console.error('Error sending file:', err);
                res.status(500).send('Error generating OMR sheet.');
            }
            // Delete the file after sending
            fs.unlinkSync(filePath);
        });
    });
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});