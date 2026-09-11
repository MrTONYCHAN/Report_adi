const resRec = await fetch('https://adigramdashboard.vercel.app/api/records/D2-11', {
  method: 'PATCH',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ kind: 'bug', status: 'open' })
});
console.log('Records endpoint status:', resRec.status);
console.log('Records endpoint response:', await resRec.text());
