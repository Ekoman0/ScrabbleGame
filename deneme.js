async function loadDictionary() {
    const res = await fetch("words.txt");
    const text = await res.text();

    const words = text.split("\n")
        .map(w => w.trim())
        .filter(w => w.length > 0)
        .map(w => w.toLocaleUpperCase("tr"));

    return new Set(words);
}

let DICT;

loadDictionary().then(set => {
    DICT = set;
    console.log("Sözlük yüklendi:", DICT.size);
});