// The single list of games shown on the home screen.
//
// To add a game: create a folder under /games and add one entry here.
//   id     unique, matches the folder name
//   name   for parents / screen readers (never shown to the child)
//   tile   picture shown on the home screen (square, ~512px)
//   entry  the game's ES module (see games/animal-tap/game.js for the shape)
// An entry without `entry` is a "coming soon" tile: greyed-out and asleep.

export const GAMES = [
  { id: "animal-tap", name: "Animal Tap", tile: "assets/tile-animal-tap.jpg", entry: "games/animal-tap/game.js" },
  { id: "colours", name: "Colours (coming soon)", tile: "assets/tile-colours.jpg" },
  { id: "music", name: "Music (coming soon)", tile: "assets/tile-music.jpg" },
  { id: "shapes", name: "Shapes (coming soon)", tile: "assets/tile-shapes.jpg" },
];
