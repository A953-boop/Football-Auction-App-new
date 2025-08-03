const socket = io();
let team = "";
let isAdmin = false;
let currentPlayer = "";
let currentBid = 0;
let maxMoney = 0;
let bidIncrement = 0;
let teamBudget = 0;
let purchasedPlayers = [];

// Login function for team or admin
function login() {
  team = document.getElementById("teamInput").value;

  // If admin logs in, show the admin panel
  if (team.toLowerCase() === "admin") {
    isAdmin = true;
    document.getElementById("adminPanel").style.display = "block";  
    document.getElementById("auction").style.display = "none";  
  }

  // If it's a team, show the auction screen
  if (team && !isAdmin) {
    document.getElementById("login").style.display = "none";
    document.getElementById("auction").style.display = "block";
    document.getElementById("welcome").innerText = "Welcome, " + team;
    socket.emit("join", team);
  }

  // Prevent entering invalid team name
  if (!team || isAdmin) {
    return;
  }
}

// When team data is updated (including purchased players), update the UI
socket.on("updateTeamData", (teamData) => {
  console.log("Updated team data:", teamData);  // Debugging line

  // Update purchased players list
  let purchasedPlayersHTML = "<h4>Players Purchased:</h4><ul>";
  if (Array.isArray(teamData.purchasedPlayers)) {
    teamData.purchasedPlayers.forEach(player => {
      purchasedPlayersHTML += `<li>${player}</li>`;
    });
  }
  purchasedPlayersHTML += "</ul>";

  if (document.getElementById("purchasedPlayersInfo")) {
    document.getElementById("purchasedPlayersInfo").innerHTML = purchasedPlayersHTML;
  }
 // Update balance information
  if (document.getElementById("balanceInfo")) {
    document.getElementById("balanceInfo").innerHTML = `
      <h4>Your Balance: ₹${teamData.budget}</h4>
    `;
  }

});

// Update auction UI with current player, bid amount, and remaining balance
socket.on("update", (data) => {
  console.log("Received data:", data);  // Log the received data for debugging

  // Display current player and bidding information
  if (document.getElementById("playerInfo")) {
    document.getElementById("playerInfo").innerHTML = `
      <h3>Player: ${data.player}</h3>
      <p>Highest Bid: ₹${data.amount} by ${data.bidder}</p>
      <p>Time Left: ${data.time}s</p>
    `;
  }

  // Display the remaining balance after each bid
  

  // Display the purchased players list
  let purchasedPlayersHTML = "<h4>Players Purchased:</h4><ul>";
  if (Array.isArray(data.purchasedPlayers)) {
    data.purchasedPlayers.forEach(player => {
      purchasedPlayersHTML += `<li>${player}</li>`;
    });
  }
  purchasedPlayersHTML += "</ul>";
  if (document.getElementById("purchasedPlayersInfo")) {
    document.getElementById("purchasedPlayersInfo").innerHTML = purchasedPlayersHTML;
  }

  // Display maximum money and bid increment
  if (document.getElementById("maxMoneyInfo")) {
    document.getElementById("maxMoneyInfo").innerHTML = `Max Money: ₹${data.maxMoney}`;
  }

  if (document.getElementById("bidIncrementInfo")) {
    document.getElementById("bidIncrementInfo").innerHTML = `Bid Increment: ₹${data.bidIncrement}`;
  }
});

// Place bid by a team
function placeBid() {
  if (currentBid + bidIncrement <= maxMoney) {
    socket.emit("bid", { team });
  } else {
    alert("Bid exceeds the maximum money allowed for this player.");
  }
}

// Admin Controls (Start Auction)
function startAuction() {
  maxMoney = parseInt(document.getElementById("maxMoneyInput").value);
  bidIncrement = parseInt(document.getElementById("bidIncrementInput").value);

  document.getElementById("maxMoneyInput").disabled = true;
  document.getElementById("bidIncrementInput").disabled = true;

  document.getElementById("playerPanel").style.display = "block";
  document.getElementById("adminPanel").style.display = "none";

  socket.emit("startAuction", { maxMoney, bidIncrement });
}

// Admin starts auction for a specific player
function startAuctionForPlayer() {
  const playerName = document.getElementById("playerNameInput").value;
  if (playerName && maxMoney > 0 && bidIncrement > 0) {
    socket.emit("startAuction", { playerName, maxMoney, bidIncrement });
    document.getElementById("playerNameInput").value = "";
  } else {
    alert("Please enter valid values for player name, max money, and bid increment.");
  }
}

// Admin Reset Auction
function resetAuction() {
  socket.emit("resetAuction");
}
