// 1:1 대결 연결: 이 게임을 보내 준 컴퓨터(server.mjs)의 /ws 에 웹소켓으로 붙는다.
// 깃허브 페이지(https)처럼 server.mjs가 아닌 곳에서 열면 연결되지 않는다.
export function connect({ onMessage, onOpen, onClose }) {
  let ws;
  const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
  try { ws = new WebSocket(url); } catch (e) { setTimeout(() => onClose && onClose(false), 0); return null; }
  let opened = false;
  ws.onopen = () => { opened = true; onOpen && onOpen(); };
  ws.onmessage = ev => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } onMessage && onMessage(m); };
  ws.onclose = () => onClose && onClose(opened);
  return {
    send: msg => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); },
    close: () => { try { ws.onclose = null; ws.close(); } catch (e) { /* 무시 */ } },
    // 경기 화면이 넘겨받아 메시지 받는 곳을 바꾼다
    setHandlers: h => { onMessage = h.onMessage ?? onMessage; onClose = h.onClose ?? onClose; },
  };
}
