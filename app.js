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

// Reddit API Functions
async function searchRedditGameThread(teamAbbrev1, teamAbbrev2, sport = 'NHL') {
    try {
        const subreddit = sport === 'NBA' ? 'nba' : 'hockey';
        const today = new Date();
        const searchQuery = `Game Thread ${teamAbbrev1} ${teamAbbrev2}`;

        const url = `/api/reddit/r/${subreddit}/search.json?q=${encodeURIComponent(searchQuery)}&sort=new&restrict_sr=on&t=day&limit=10`;
        const response = await fetch(url);

        if (!response.ok) return null;
        const data = await response.json();

        // Find the most relevant game thread
        if (data.data && data.data.children && data.data.children.length > 0) {
            const thread = data.data.children.find(post => {
                const title = post.data.title.toLowerCase();
                return title.includes('game thread') &&
                    (title.includes(teamAbbrev1.toLowerCase()) || title.includes(teamAbbrev2.toLowerCase()));
            });

            if (thread) {
                return {
                    id: thread.data.id,
                    title: thread.data.title,
                    url: `https://www.reddit.com${thread.data.permalink}`,
                    subreddit: thread.data.subreddit
                };
            }
        }
        return null;
    } catch (error) {
        console.error('Error searching Reddit:', error);
        return null;
    }
}

async function fetchRedditComments(subreddit, postId) {
    try {
        const url = `/api/reddit/r/${subreddit}/comments/${postId}.json?limit=15`;
        const response = await fetch(url);

        if (!response.ok) return [];
        const data = await response.json();

        // Reddit returns [post_data, comments_data]
        if (data.length > 1 && data[1].data && data[1].data.children) {
            return data[1].data.children
                .filter(c => c.kind === 't1' && c.data.body) // Filter actual comments
                .slice(0, 10) // Top 10 comments
                .map(comment => ({
                    author: comment.data.author,
                    body: comment.data.body,
                    score: comment.data.score,
                    created: comment.data.created_utc
                }));
        }
        return [];
    } catch (error) {
        console.error('Error fetching Reddit comments:', error);
        return [];
    }
}

function formatTimeAgo(unixTimestamp) {
    const seconds = Math.floor(Date.now() / 1000 - unixTimestamp);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

function renderRedditComments(comments, threadUrl) {
    if (!comments || comments.length === 0) {
        return '<div class="reddit-empty">No comments found</div>';
    }

    let html = '<div class="reddit-comments">';
    comments.forEach(comment => {
        html += `
            <div class="reddit-comment">
                <div class="comment-header">
                    <span class="comment-author">${comment.author}</span>
                    <span class="comment-score">↑ ${comment.score}</span>
                    <span class="comment-time">${formatTimeAgo(comment.created)}</span>
                </div>
                <div class="comment-body">${escapeHtml(comment.body).substring(0, 300)}${comment.body.length > 300 ? '...' : ''}</div>
            </div>
        `;
    });
    html += `<div class="reddit-footer"><a href="${threadUrl}" target="_blank" rel="noopener">View full thread on Reddit →</a></div>`;
    html += '</div>';
    return html;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
// Logic: Determine Display Status for NHL Game
function getNHLStatusDisplay(game) {
    const state = game.gameState;

    if (state === 'FUT' || state === 'PRE') {
        const startTime = new Date(game.startTimeUTC).getTime();
        return {
            class: 'status-future',
            text: `<span class="future-timer" data-target-time="${game.startTimeUTC}">Starts in ...</span>`,
            detail: `Starts at ${formatTime(game.startTimeUTC)}`
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
            const periodNum = game.periodDescriptor.number;
            const periodStr = getPeriodOrdinal(periodNum);
            const isOT = periodNum > 3;
            const seconds = game.clock.secondsRemaining;
            const timeHtml = `<span class="live-timer" data-seconds="${seconds}">${formatMMSS(seconds)}</span>`;

            return {
                class: 'status-live',
                text: `${isOT ? 'OT' : 'P' + periodNum} - ${timeHtml}`,
                detail: isOT ? `Playing Overtime` : `Playing ${periodStr} Period`
            };
        }
    }

    if (state === 'FINAL' || state === 'OFF') {
        let text = 'FINAL';
        if (game.gameOutcome && game.gameOutcome.lastPeriodType === 'OT') text += ' (OT)';
        if (game.gameOutcome && game.gameOutcome.lastPeriodType === 'SO') text += ' (SO)';
        return {
            class: 'status-future',
            text: text
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
        <button class="reddit-toggle-btn">Show Reddit Comments</button>
        <div class="reddit-container" style="display: none;">
            <div class="reddit-loading">Loading comments...</div>
        </div>
    `;

    // Add Reddit toggle functionality
    const toggleBtn = card.querySelector('.reddit-toggle-btn');
    const redditContainer = card.querySelector('.reddit-container');
    let commentsLoaded = false;

    toggleBtn.addEventListener('click', async () => {
        if (redditContainer.style.display === 'none') {
            redditContainer.style.display = 'block';
            toggleBtn.textContent = 'Hide Reddit Comments';

            if (!commentsLoaded) {
                // Load comments
                const thread = await searchRedditGameThread(awayAbbrev, homeAbbrev, isNBA ? 'NBA' : 'NHL');

                if (thread) {
                    const comments = await fetchRedditComments(thread.subreddit, thread.id);
                    redditContainer.innerHTML = `
                        <div class="reddit-thread-title">${escapeHtml(thread.title)}</div>
                        ${renderRedditComments(comments, thread.url)}
                    `;
                } else {
                    redditContainer.innerHTML = '<div class="reddit-empty">No game thread found yet</div>';
                }
                commentsLoaded = true;
            }
        } else {
            redditContainer.style.display = 'none';
            toggleBtn.textContent = 'Show Reddit Comments';
        }
    });

    return card;
}

function renderGames(nhlGames, nbaGames) {
    const nhlContainer = document.getElementById('nhl-games');
    const nbaContainer = document.getElementById('nba-games');

    // Clear both containers
    if (nhlContainer) nhlContainer.innerHTML = '';
    if (nbaContainer) nbaContainer.innerHTML = '';

    const sortGames = (games) => {
        return games.sort((a, b) => {
            const getRank = (g) => {
                // Normalize status: 0=Live, 1=Future, 2=Final
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
            return getRank(a) - getRank(b);
        });
    };

    const renderList = (games, container, emptyMsg) => {
        if (!container) return;
        if (games.length === 0) {
            container.innerHTML = `<div class="loading">${emptyMsg}</div>`;
            return;
        }
        sortGames(games).forEach(game => {
            container.appendChild(createGameCard(game));
        });
    };

    renderList(nhlGames, nhlContainer, 'No NHL games today');
    renderList(nbaGames, nbaContainer, 'No NBA games today');
}

// Helper: Format Milliseconds to HH:MM:SS
function formatCountdown(ms) {
    if (ms < 0) return 'Starting...';
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h}h ${m}m ${s}s`;
}

// Timer logic
function tick() {
    // Live game clocks (decrement seconds)
    const timers = document.querySelectorAll('.live-timer');
    timers.forEach(timer => {
        let seconds = parseInt(timer.dataset.seconds, 10);
        if (!isNaN(seconds) && seconds > 0) {
            seconds--;
            timer.dataset.seconds = seconds;
            timer.textContent = formatMMSS(seconds);
        }
    });

    // Future game countdowns (calculate from target time)
    const futureTimers = document.querySelectorAll('.future-timer');
    const now = new Date();
    futureTimers.forEach(timer => {
        const targetTime = new Date(timer.dataset.targetTime);
        const diff = targetTime - now;
        timer.textContent = formatCountdown(diff);
    });
}

// Tab Switching Logic
document.querySelectorAll('.tab-btn').forEach(button => {
    button.addEventListener('click', () => {
        // Remove active class from all buttons and containers
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.games-container').forEach(con => con.classList.remove('active-content'));

        // Add active class to clicked button
        button.classList.add('active');

        // Show corresponding container
        const tabId = button.dataset.tab; // 'nhl' or 'nba'
        document.getElementById(`${tabId}-games`).classList.add('active-content');
    });
});

async function update() {
    const [nhlGames, nbaGames] = await Promise.all([fetchNHLGames(), fetchNBAGames()]);
    renderGames(nhlGames, nbaGames);
}

// Initial load
update();
// Update every 10 seconds
setInterval(update, 10000);
// Update timers every second
setInterval(tick, 1000);
