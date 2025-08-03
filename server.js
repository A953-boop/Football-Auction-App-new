const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const admin = require("firebase-admin");
require('dotenv').config();

// Firebase initialization using environment variable
const serviceAccount = JSON.parse(process.env.FIREBASE_PRIVATE_KEY);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const app = express();

app.use(express.static(__dirname));

const server = http.createServer(app);
const io = socketIo(server);  // Use the HTTP server for socket.io

// Auction variables
let player = "", amount = 0, bidder = "", timer = 180, interval;
let teams = {}, history = [], maxMoney = 0, bidIncrement = 0;

// Update all clients with the auction state
function updateAll() {
  for (let socketId in teams) {
    const team = teams[socketId];
    io.to(socketId).emit("update", {
      player,
      amount,
      bidder,
      time: timer,
      balance: team.budget,
      purchasedPlayers: team.purchasedPlayers,
      maxMoney: maxMoney,
      bidIncrement: bidIncrement,
    });
  }
}

// Reset auction timer
function resetTimer() {
  timer = 10;  // Reset to 180 seconds (3 minutes)
  clearInterval(interval);
  interval = setInterval(() => {
    timer--;
    updateAll();  // Update all clients with the current timer
    if (timer <= 0) {
      clearInterval(interval);
      if (bidder) {
        let team = Object.values(teams).find(t => t.name === bidder);
        if (team) {
          team.budget -= amount;  // Deduct the bid amount from the team's budget
          team.purchasedPlayers.push(player);  // Add player to the list of purchased players
          console.log(`Player ${player} purchased by ${team.name} for ₹${amount}`);

          // Save team data to Firestore
          db.collection("teams").doc(team.name).set({
            budget: team.budget,
            purchasedPlayers: team.purchasedPlayers  // Ensure purchased players are saved
          });
        }
        history.push({ player, amount, bidder });  // Record this auction in history

        // Save auction history to Firestore
        db.collection("history").add({
          player,
          amount,
          bidder,
          timestamp: new Date()
        });
      }
      player = ""; amount = 0; bidder = "";  // Reset for next auction
      updateAll();  // Broadcast auction reset to all teams
      io.emit("history", history);  // Send the updated auction history
    }
  }, 1000);  // Update every second
}

io.on("connection", socket => {

  // When a team joins
 socket.on("join", async (name) => {
  let teamDoc = await db.collection("teams").doc(name).get();

  // If team exists, fetch data
  if (teamDoc.exists) {
    let teamData = teamDoc.data();
    let remainingBalance = teamData.budget;  // Fetch remaining balance from the team data

    teams[socket.id] = {
      name,
      budget: remainingBalance,
      purchasedPlayers: teamData.purchasedPlayers || []  // Ensure purchased players are fetched
    };

    console.log(`Team ${name} logged in with remaining balance: ₹${remainingBalance}`);
    console.log(`Purchased Players for ${name}:`, teamData.purchasedPlayers);
  } else {
    // Create new team if not exists
    teams[socket.id] = {
      name,
      budget: maxMoney,  // Set maxMoney for new team
      purchasedPlayers: []
    };

    // Log the new team's balance
    console.log(`New team ${name} created with balance: ₹${maxMoney}`);
    
    // Save the new team data to Firestore
    await db.collection("teams").doc(name).set(teams[socket.id]);
  }

  // Emit team data (including purchased players)
  socket.emit("update", { player, amount, bidder, time: timer });
  socket.emit("history", history);  // Send auction history to the new team
  socket.emit("updateTeamData", teams[socket.id]);  // Emit updated team data (with purchased players)
});


  // When a team places a bid
  socket.on("bid", () => {
    if (!player) return;  // If no player is up for auction, do nothing
    let team = teams[socket.id];
    if (!team || team.budget < amount + bidIncrement) return socket.emit("status", "Insufficient budget");

    amount += bidIncrement;  // Increase bid by increment
    bidder = team.name;  // Set the current bidder to the team's name
    updateAll();  // Update all teams with the new bid details
    resetTimer();  // Reset the auction timer whenever a new bid is placed
  });

  // Admin starts the auction with a new player
  socket.on("startAuction", (data) => {
  if (data.playerName) {
    // Player Auction: Do not change maxMoney and bidIncrement
    player = data.playerName;  // Set the player for this auction
    amount = 0;  // Reset the bid amount
    bidder = "";  // Reset the bidder
    timer = 15;  // Set auction timer to 10 seconds for player auction (or use 180 for main auction)
    console.log("Player Auction started for: ", player);

    // Only send out the player auction details (without changing maxMoney and bidIncrement)
    updateAll();  // Broadcast updated player auction state to all clients
    resetTimer();  // Start the auction timer countdown
  } else {
    // Main Auction: Update maxMoney and bidIncrement
    maxMoney = data.maxMoney;  // Set the maximum money for this auction
    bidIncrement = data.bidIncrement;  // Set the bid increment for this auction
    amount = 0;  // Reset the bid amount
    bidder = "";  // Reset the bidder
    timer = 180;  // Set auction timer to 180 seconds for main auction
    console.log("Main Auction started with maxMoney: ₹" + maxMoney + " and bidIncrement: ₹" + bidIncrement);

    // Update each team's budget to the current maxMoney
    for (let socketId in teams) {
      const team = teams[socketId];
      team.budget = maxMoney;  // Set the budget for each team
      console.log(team.budget, "after setting maxMoney");

      // Save the team's updated data to Firestore
      db.collection("teams").doc(team.name).set({
        budget: team.budget,
        purchasedPlayers: team.purchasedPlayers
      });
    }

    updateAll();  // Broadcast updated auction state to all clients
    resetTimer();  // Start the auction timer countdown
  }
});


socket.on("resetAuction", async () => {
  // Fetch the latest maxMoney from the Firestore (auction settings document)
  const auctionSettingsDoc = await db.collection("auctionSettings").doc("currentAuction").get();
  if (auctionSettingsDoc.exists) {
    const { maxMoney } = auctionSettingsDoc.data(); // Get the current maxMoney from Firestore

    // Clear all teams' data and reset them with the new maxMoney
    for (let socketId in teams) {
      const team = teams[socketId];
      // Reset team data in Firestore with the new maxMoney
      await db.collection("teams").doc(team.name).set({
        budget: maxMoney,  // Reset to the current maxMoney (instead of the old value)
        purchasedPlayers: []  // Clear the purchased players list
      });
    }

    console.log("Auction reset. All teams reset with maxMoney: ₹" + maxMoney);

    // You can broadcast any reset message or update all clients as needed
    updateAll();  // Update all clients with the reset auction state
    resetTimer();  // Restart the auction timer
  } else {
    console.log("Error: Current auction settings not found.");
  }
});


  // Admin resets the auction
  socket.on("resetAuction", () => {
    player = "";
    amount = 0;
    bidder = "";
    timer = 180;  // Reset the timer
    updateAll();  // Broadcast the reset to all clients
    resetTimer();  // Restart the auction timer
  });
});

// Start the server
const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});