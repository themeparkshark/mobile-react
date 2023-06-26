export default function shortenNumber(number: number): string {
  const suffixes: string[] = ['', 'k', 'M', 'B', 'T'];
  const suffixNum: number = Math.floor(('' + number).length / 3);

  let shortNum: number = parseFloat(
    (suffixNum !== 0 ? number / Math.pow(1000, suffixNum) : number).toPrecision(
      3
    )
  );

  if (shortNum % 1 !== 0) {
    shortNum = Number(shortNum.toFixed(1));
  }

  return shortNum + suffixes[suffixNum];
}
