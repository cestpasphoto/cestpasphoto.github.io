# AI on your browser

All AI are running on client side, need 10\~20s to load it first time.

### Links

**Abalone**
- <https://cestpasphoto.github.io/abalone.html?layout=0>
- <https://cestpasphoto.github.io/abalone.html?layout=1>
- <https://cestpasphoto.github.io/abalone.html?layout=2>

**Akropolis**
- <https://cestpasphoto.github.io/akropolis.html?players=2>
- <https://cestpasphoto.github.io/akropolis.html?players=3>
- <https://cestpasphoto.github.io/akropolis.html?players=4>

**Azul**
- <https://cestpasphoto.github.io/azul.html?players=2>
- <https://cestpasphoto.github.io/azul.html?players=3>
- <https://cestpasphoto.github.io/azul.html?players=4>

**Botanik**
- <https://cestpasphoto.github.io/botanik.html>

**Catan**
- <https://cestpasphoto.github.io/catan.html?players=2>
- <https://cestpasphoto.github.io/catan.html?players=3>
- <https://cestpasphoto.github.io/catan.html?players=4>

**Machi Koro (Minivilles)**
- <https://cestpasphoto.github.io/minivilles.html?players=2>
- <https://cestpasphoto.github.io/minivilles.html?players=3>
- <https://cestpasphoto.github.io/minivilles.html?players=4>

**Santorini**
- <https://cestpasphoto.github.io/santorini.html>
- <https://cestpasphoto.github.io/santorini.html?gods=11>

**Splendor**
- <https://cestpasphoto.github.io/splendor.html?players=2>
- <https://cestpasphoto.github.io/splendor.html?players=3>
- <https://cestpasphoto.github.io/splendor.html?players=4>

**Smallworld**
- <https://cestpasphoto.github.io/smallworld.html?players=2>
- <https://cestpasphoto.github.io/smallworld.html?players=3>
- <https://cestpasphoto.github.io/smallworld.html?players=4>

**The Little Prince**
- <https://cestpasphoto.github.io/tlp.html?players=3>
- <https://cestpasphoto.github.io/tlp.html?players=4>
- <https://cestpasphoto.github.io/tlp.html?players=5>

**Wordle**
- <https://cestpasphoto.github.io/wordle.html>

## Online Santorini AI

This AI is based on AlphaZero training. I have reused an existing training engine and significantly modified it, I fully implemented everything else from game logic, ML network design, training tuning, port to browser and JS/HTML interface.

### Strength

Compared to best AI I found:
* \>95% winrate against [Ai Ai](http://mrraow.com/index.php/aiai-home/aiai/) - 20 wins in 20 games
  * Even running a degraded version of mine leads to >90% winrate - 10 wins in 10 games
* 98+% win rate against [BoardSpace AI](https://www.boardspace.net/english/index.shtml), using BestBot

Details: these games use no god power, other AI always starting first, both with random initial positions. Mine was running at 800 rollouts per move (50 for degraded version), Ai Ai was set with a timelimit of 15+15sec/move (about 900k iterations on my computer). 

The training has been fully done on CPU, check [my repo](https://github.com/cestpasphoto/alpha-zero-general) and [this ReadMe](https://github.com/cestpasphoto/alpha-zero-general/blob/master/santorini/README.md).

The UI also propose "undervolted" settings: instead of exploring 800 future positions, it explores 200 or 50 or 10 of them to reduce strength.

### Speed

About 5 to 10sec per turn when using AI native level. See other details in (#common-technical-details).
You can find higher performance application on this [repo](https://github.com/cestpasphoto/alpha-zero-general), requiring you to install python and many other modules.


## Online Smallworld AI

Using same AI as Santorini, described above. Supports 2, 3 and 4 players. Each token movement is considered as one move.

### Strength

No objective tests done. Note that randomness can have a lot of impact on this game but benchmarks should be done carefully.
The training has been fully done on CPU, check [my repo](https://github.com/cestpasphoto/alpha-zero-general).

The UI also propose "undervolted" settings: instead of exploring 1600 future positions, it explores 400 or 100 or 25 or 10 of them to reduce strength.


## Online Splendor AI

Using same AI as Santorini, described above. Supporting 2, 3 and 4 players.

### Strength

Compared to the only AI I found: \>90% winrate against [Lapidary AI](https://github.com/inclement/lapidary-ai) - 10 wins in 10 games, with a median 14 points difference (median game is 16-2).

Details: needed to reproduce Lapidary "behavior" (only to win gold even if one has 10 gems, new card from deck appears on the right instead of replacing old card slot). My AI doesn't allow simultaneously giving back and taking gems so I needed to do some hack. Lapidary is aware of card in deck, whereas mine wasn't (I always replaced random card by the one chose by Lapidary). My AI was running in "native" mode, meaning 400 rollouts per move. My AI doesn't know which cards will be drawn. 

The training has been fully done on CPU, check [my repo](https://github.com/cestpasphoto/alpha-zero-general).

The UI also propose "undervolted" settings: instead of exploring 400 future positions, it explores 200 or 50 or 10 of them to reduce strength. If AI was trained with these lower numbers, it could have been stronger but that wasn't the purpose.


## Online Akropolis AI

Using same AI as Santorini, described above. Supporting 2, 3 and 4 players.

### Strength

No objective tests done except [this one](https://www.reddit.com/r/boardgames/comments/133f72n/comment/n5gymnk/?utm_source=share&utm_medium=web3x&utm_name=web3xcss&utm_term=1&utm_content=share_button) in 2 players mode, it "only" wins 78% of the games. Note that randomness can have a lot of impact on this game so benchmarks should be done carefully.
The training has been fully done on CPU, check [my repo](https://github.com/cestpasphoto/alpha-zero-general).

The UI also propose "undervolted" settings: instead of exploring 1600 future positions, it explores 400 or 100 or 25 or 10 of them to reduce strength.


## Online Catan AI

Using same AI as Santorini, described above. Supporting 2, 3 and 4 players.

The AI plays with the same information as a human player: it doesn't see opponents' resources and development cards, nor the order of the development deck.

### Rules

Official rules, with a few changes needed to keep the search tractable:
* Trading with other players: the player whose turn it is may broadcast one offer per turn, up to 3 cards asked for up to 3 cards given. Each other player, in turn, accepts or declines; the first one to accept makes the trade. No counter-offers.
* At most 6 bank/port trades per turn.

### Strength

No objective tests against another Catan AI done yet. It wins more than 90% of games against a simple rule-based bot.
The training has been fully done on CPU, check [my repo](https://github.com/cestpasphoto/alpha-zero-general).


## Online Machi Koro AI

Using same AI as Santorini, described above. Supporting 2, 3 and 4 players.

### Rules

Official base-game rules, with the choices that the original game leaves to the player made automatically:
* Business Center: your cheapest establishment is swapped with the most expensive one of the wealthiest player (purple cards excluded).
* TV Station: 5 coins are taken from a player who has at least 5, the wealthiest first.

### Strength

No objective tests done.
The training has been fully done on CPU, check [my repo](https://github.com/cestpasphoto/alpha-zero-general).


## Online The Little Prince AI

Using same AI as Santorini, described above. Supporting 3, 4 and 5 players.

### Rules

Official turn structure: the first player of a turn chooses the stack (center, uphill edge, downhill edge or character), one card per player is drawn, then each player takes a card and designates who plays next among those who have not played yet. The last player opens the next turn.

### Strength

No objective tests done.
The training has been fully done on CPU, check [my repo](https://github.com/cestpasphoto/alpha-zero-general).


## Online Botanik AI

Two players, rules of [Botanik](https://boardgamegeek.com/boardgame/271529/botanik) with one adaptation: a card that would close the last open pipe of a machine cannot be placed (engine filter, not a rule of the game); freed cards with no legal place are thrown away.

An arrival card is played as soon as you tap a highlighted slot. The other decisions are previewed first: tap where the card goes, then *Place*; in a machine, tap the same cell again to turn the card. Undoing the move that emptied the arrival zone also undoes the draw.

No objective tests done.

## Online Azul AI

Using same AI as Santorini, described above. Supporting 2, 3 and 4 players.

### Rules

Official rules, with the coloured wall (side A). The factories of a round are drawn from the bag at the end of the previous round.

### Strength

No objective tests against another Azul AI done yet.
The training has been fully done on CPU, check [my repo](https://github.com/cestpasphoto/alpha-zero-general).


## Online wordle solver

Based on entropy method from the 3Blue1Brown [video](https://www.youtube.com/watch?v=v68zYyaEmEA), I developed this AI compatible with not only English dictionary but also French one.

You can find higher performance application on this [repo](https://github.com/cestpasphoto/wordle_solver_french), requiring you to install python.

<details>
<summary>Click here to see technical details</summary>
Longest computation time is first word, when we know nothing about solution. I pre-computed these best first words on all conditions (fr/eng, all words lengths, with first letter known/unknown).
To improve even further computation time, I can restrict research to the X most popular words: it decrease a little bit AI strenght for a much shorter thinking time.

I managed to retrieve occurence percentage for each word: that allows to filter out very rare words, which is advised. We can even weight words depending on their occurence: this is advised for "easy" game but not advised for "hard" game like the one in the NY times.

See other details in (#common-technical-details).
</details>

## Common technical details

My goal from the start was to run AI on client side. They all use the following technology:
* Python code running in browser running with [pyodide](https://pyodide.org/en/stable/). Still in beta phase, a bit long to load but very stable and compatible with several external modules such as numpy! It is based on WebAssembly so performance is quite good.
* AlphaZero need a ML inference library: [onnx](https://github.com/microsoft/onnxruntime-inference-examples/tree/main/js) has an JS version and has no framework incompatibility (both TF and PyTorch can export in ONNX format). I found the WebGL to be quite buggy on some browsers so I went for the WASM version which uses client CPU.
* I am no expert in JS/HTML/CSS so I chose fomantic-ui: result is quite decent on PC and mobile with low barrier at start. But gosh JavaScript is such an ugly language :-)

I was quite surprised by the final performance of AlphaZero ported in the browser: since game logic and MCTS is in python/pyodide and ML is in JavaScript, browser has to switch these two frameworks and therefore a larger overhead for type conversion. I expected this overhead to be worse but at the end, it is has roughly same speed than regulary python and only 5-10x slower than numba.

---

## License

My own code is licensed under the [PolyForm Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0/): free to use, modify and share for noncommercial purposes. Parts derived from [alpha-zero-general](https://github.com/suragnair/alpha-zero-general) remain under the MIT License. See [LICENSE](LICENSE) for details. For commercial use, please contact me.
