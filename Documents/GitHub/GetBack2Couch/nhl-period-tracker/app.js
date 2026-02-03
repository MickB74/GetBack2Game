const NHL_SCHEDULE_URL = '/api/score/now';
const NBA_SCHEDULE_URL = '/api/nba/scoreboard/todaysScoreboard_00.json';

// Fetch NHL Games
async function fetchNHLGames() {
    try {
        const response = await fetch(NHL_SCHEDULE_URL);
        if (!response.ok) return [];
        const data = await response.json();
        return data.games || [];
    } catch (error) {
        console.error('Error fetching NHL games:', error);
        return [];
    }
}

// Fetch NBA Games
async function fetchNBAGames() {
    try {
        const response = await fetch(NBA_SCHEDULE_URL);
        if (!response.ok) return [];
        const data = await response.json();
        const games = data.scoreboard && data.scoreboard.games ? data.scoreboard.games : [];
        return games.map(game => ({
            ...game,
            sport: 'NBA' // Tag as NBA for processing
        }));
    } catch (error) {
        console.error('Error fetching NBA games:', error);
        return [];
    }
}

// Helper: Format Time HH:MM AM/PM
function formatTime(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Helper: Format Seconds to MM:SS
function formatMMSS(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// Helper: Parse ISO Duration (e.g., PT10M13.00S) to Seconds
function parseISODuration(duration) {
    if (!duration) return 0;
    const match = duration.match(/PT(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
    if (!match) return 0;
    const minutes = parseInt(match[1] || '0', 10);
    const seconds = parseInt(match[2] || '0', 10); // Floor/Parse int to ignore ms
    return (minutes * 60) + seconds;
}

// Helper: Get Period Ordinal
function getPeriodOrdinal(number, sport = 'NHL') {
    if (number === 1) return '1st';
    if (number === 2) return '2nd';
    if (number === 3) return '3rd';
    if (number === 4 && sport === 'NBA') return '4th';
    if (number > (sport === 'NBA' ? 4 : 3)) return 'OT';
    return number + 'th';
}

// Logic: Determine Display Status for NHL Game
function getNHLStatusDisplay(game) {
    const state = game.gameState;

    if (state === 'FUT' || state === 'PRE') {
        return {
            class: 'status-future',
            text: `Starts at ${formatTime(game.startTimeUTC)}`
        };
    }

    if (state === 'LIVE' || state === 'CRIT') {
        // Intermission
        if (game.clock && game.clock.inIntermission) {
            const seconds = game.clock.secondsRemaining;
            const timeHtml = `<span class="live-timer" data-seconds="${seconds}">${formatMMSS(seconds)}</span>`;
            return {
                class: 'status-intermission',
                text: 'INTERMISSION',
                detail: `${timeHtml} remaining`
            };
        }

        // Active play
        if (game.clock) {
            const period = getPeriodOrdinal(game.periodDescriptor.number);
            const seconds = game.clock.secondsRemaining;
            const timeHtml = `<span class="live-timer" data-seconds="${seconds}">${formatMMSS(seconds)}</span>`;

            return {
                class: 'status-live',
                text: `P${game.periodDescriptor.number} - ${timeHtml}`,
                detail: `Playing ${period} Period`
            };
        }
    }

    if (state === 'FINAL' || state === 'OFF') {
        return {
            class: 'status-future',
            text: 'FINAL'
        };
    }

    return {
        class: 'status-future',
        text: state
    };
}

// Logic: Determine Display Status for NBA Game
function getNBAStatusDisplay(game) {
    const status = game.gameStatus; // 1: Future, 2: Live, 3: Final

    if (status === 1) { // Future
        return {
            class: 'status-future',
            text: `Starts at ${formatTime(game.gameTimeUTC)}`
        };
    }

    if (status === 2) { // Live
        const statusText = game.gameStatusText; // e.g. "Q4 10:13", "Halftime"

        if (statusText === 'Halftime') {
            // NBA Halftime is typically 15 minutes. 
            // The API doesn't give a ticking clock for halftime usually, just "Halftime".
            // We'll hardcode a display or just show "HALFTIME" prominently.
            return {
                class: 'status-intermission',
                text: 'HALFTIME',
                detail: 'Intermission'
            };
        }

        // Active Play
        // period: 1-4
        // gameClock: PT10M13.00S
        const period = getPeriodOrdinal(game.period, 'NBA');
        const seconds = parseISODuration(game.gameClock);
        const timeHtml = `<span class="live-timer" data-seconds="${seconds}">${formatMMSS(seconds)}</span>`;

        return {
            class: 'status-live',
            text: `Q${game.period} - ${timeHtml}`,
            detail: `Playing ${period} Qtr`
        };
    }

    if (status === 3) { // Final
        return {
            class: 'status-future',
            text: 'FINAL'
        };
    }

    // Fallback
    return {
        class: 'status-future',
        text: game.gameStatusText || 'Unknown'
    };
}

// Create Game Card
function createGameCard(game) {
    const isNBA = game.sport === 'NBA';
    const status = isNBA ? getNBAStatusDisplay(game) : getNHLStatusDisplay(game);

    // Data extraction differences
    const awayAbbrev = isNBA ? game.awayTeam.teamTricode : game.awayTeam.abbrev;
    const homeAbbrev = isNBA ? game.homeTeam.teamTricode : game.homeTeam.abbrev;
    const awayScore = isNBA ? game.awayTeam.score : game.awayTeam.score;
    const homeScore = isNBA ? game.homeTeam.score : game.homeTeam.score;

    // For NBA we need to construct logo URL as it's not in the response usually
    // Typical NBA logo format: https://cdn.nba.com/logos/nba/<teamId>/global/L/logo.svg
    const awayLogo = isNBA
        ? `https://cdn.nba.com/logos/nba/${game.awayTeam.teamId}/global/L/logo.svg`
        : (game.awayTeam.logo || '');

    const homeLogo = isNBA
        ? `https://cdn.nba.com/logos/nba/${game.homeTeam.teamId}/global/L/logo.svg`
        : (game.homeTeam.logo || '');

    const card = document.createElement('div');
    card.className = 'game-card';
    if (isNBA) card.classList.add('nba-card'); // Optional styling hook

    card.innerHTML = `
        <div class="sport-badge">${isNBA ? 'NBA' : 'NHL'}</div>
        <div class="teams">
            <div class="team">
                <img src="${awayLogo}" alt="${awayAbbrev}" class="team-logo">
                <span class="team-name">${awayAbbrev}</span>
                <span class="score">${awayScore !== undefined ? awayScore : ''}</span>
            </div>
            <div class="vs">@</div>
            <div class="team">
                <img src="${homeLogo}" alt="${homeAbbrev}" class="team-logo">
                <span class="team-name">${homeAbbrev}</span>
                <span class="score">${homeScore !== undefined ? homeScore : ''}</span>
            </div>
        </div>
        <div class="game-status">
            <div class="${status.class}">${status.text}</div>
            ${status.detail ? `<div class="clock-detail">${status.detail}</div>` : ''}
        </div>
    `;
    return card;
}

function renderGames(nhlGames, nbaGames) {
    const container = document.getElementById('games-container');
    container.innerHTML = '';

    const allGames = [...nhlGames, ...nbaGames];

    if (allGames.length === 0) {
        container.innerHTML = '<div class="loading">No games scheduled for today.</div>';
        return;
    }

    // Sort: Live first, then Future, then Final
    const sortedGames = allGames.sort((a, b) => {
        const getScore = (g) => {
            // Normalize status to 0 (Live), 1 (Future), 2 (Final)
            if (g.sport === 'NBA') {
                if (g.gameStatus === 2) return 0;
                if (g.gameStatus === 1) return 1;
                return 2;
            } else {
                if (g.gameState === 'LIVE' || g.gameState === 'CRIT') return 0;
                if (g.gameState === 'FUT' || g.gameState === 'PRE') return 1;
                return 2;
            }
        };
        return getScore(a) - getScore(b);
    });

    sortedGames.forEach(game => {
        container.appendChild(createGameCard(game));
    });
}

// Timer logic
function tick() {
    const timers = document.querySelectorAll('.live-timer');
    timers.forEach(timer => {
        let seconds = parseInt(timer.dataset.seconds, 10);
        if (!isNaN(seconds) && seconds > 0) {
            seconds--;
            timer.dataset.seconds = seconds;
            timer.textContent = formatMMSS(seconds);
        }
    });
}

async function update() {
    const [nhlGames, nbaGames] = await Promise.all([fetchNHLGames(), fetchNBAGames()]);
    renderGames(nhlGames, nbaGames);
}

// Initial load
update();

// Local tick every second
setInterval(tick, 1000);

// Data refresh every 10 seconds
setInterval(update, 10000);
