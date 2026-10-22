// Short-lived web credentials stay in memory, not browser persistent storage.
let session:{token:string;address:string;expiresAt:string}|null=null;
export function setWebSession(value:typeof session){session=value;}
export function webSession(){if(session&&Date.parse(session.expiresAt)<=Date.now())session=null;return session;}
export function authHeaders():Record<string,string>{const current=webSession();return current?{Authorization:`Bearer ${current.token}`}:{ };}
