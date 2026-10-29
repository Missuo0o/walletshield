import React from 'react';
import {Mail,ShieldCheck} from 'lucide-react';

const team=[
 {name:'Yukui McDonald',role:'Team Lead and Architect',initials:'YM'},
 {name:'Patrick McDonald',role:'Digital Currency and Trading Regulatory Analyst',initials:'PM'},
 {name:'Shun Zhang',role:'Developer',initials:'SZ'},
 {name:'Xiaoyue He',role:'Web Designer',initials:'XH'},
];

export function AboutUs(){return <div className="about-page">
 <div className="page-heading"><div><div className="eyebrow"><span/> THE PEOPLE BEHIND WALLETSHIELD</div><h1>About Us</h1><p>Helping people understand wallet requests before they sign.</p></div></div>
 <section className="panel about-mission" aria-labelledby="about-mission-title"><ShieldCheck size={28} aria-hidden="true"/><div><h2 id="about-mission-title">A clearer view before you sign</h2><p>WalletShield brings wallet request analysis, on-chain evidence and Muse AI risk assessments into the wallet experience, so users can review the findings and make an informed decision.</p></div></section>
 <section aria-labelledby="about-team-title"><h2 id="about-team-title" className="about-section-title">Meet the team</h2><div className="about-team">{team.map(member=><article className="panel about-member" key={member.name}><div className="about-avatar" aria-hidden="true">{member.initials}</div><h3>{member.name}</h3><p>{member.role}</p></article>)}</div></section>
 <section className="panel about-contact" aria-labelledby="about-contact-title"><div><h2 id="about-contact-title">Get in touch</h2><p>Questions about WalletShield? Contact our team.</p></div><a href="mailto:applebearscabinet26@gmail.com"><Mail size={18} aria-hidden="true"/>applebearscabinet26@gmail.com</a></section>
 </div>;}
