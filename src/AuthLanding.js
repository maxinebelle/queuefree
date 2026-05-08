import React from "react";
import { useNavigate } from "react-router-dom";

function AuthLanding() {
  const navigate = useNavigate();

  const highlights = [
    {
      value: "Digital",
      label: "Queue Access",
      note: "Get a queue number without staying in line."
    },
    {
      value: "Live",
      label: "Status Tracking",
      note: "Monitor queue progress in real time."
    },
    {
      value: "Smart",
      label: "Queue Updates",
      note: "Know when your turn is getting near."
    },
    {
      value: "Campus",
      label: "Service Support",
      note: "Built for UCLM office transactions."
    }
  ];

  const features = [
    {
      icon: "🎫",
      title: "Digital Queue Tickets",
      text: "Request your queue ticket online and avoid unnecessary physical waiting."
    },
    {
      icon: "📡",
      title: "Live Status Updates",
      text: "Track the current number being served and your queue position in real time."
    },
    {
      icon: "🔔",
      title: "Helpful Notifications",
      text: "Receive updates when your turn is approaching so you can prepare in advance."
    },
    {
      icon: "📊",
      title: "Office Monitoring",
      text: "Support better queue flow through an organized and easy-to-manage system."
    }
  ];

  const steps = [
    {
      number: "1",
      title: "Create an account",
      text: "Register your account and choose your queue access."
    },
    {
      number: "2",
      title: "Join a queue",
      text: "Select the office or service you need from the system."
    },
    {
      number: "3",
      title: "Track your status",
      text: "Monitor your queue position through real-time updates."
    },
    {
      number: "4",
      title: "Get served on time",
      text: "Proceed when your turn is near or when you are called."
    }
  ];

  const teamMembers = [
    {
      name: "Lariba, Marie Belle",
      title: "Project Manager",
      description:
        "Leads the planning, coordination, and overall direction of QueueFree.",
      image: "/belle.png"
    },
    {
      name: "Amahan, Glyka Marie",
      title: "Developer",
      description:
        "Builds and improves the system features for a smoother queue process.",
      image: "/marie.png"
    },
    {
      name: "Seno, Ma. Jodelyn",
      title: "UI/UX Designer",
      description:
        "Designs the user experience and interface flow of the system.",
      image: "/piyaya.png"
    },
    {
      name: "Dusaran, Celine Kaye",
      title: "Document Manager",
      description:
        "Handles documentation, research support, and project organization.",
      image: "/celine.png"
    }
  ];

  const contacts = [
    {
      label: "Email Support",
      value: "queuefree.uclm@gmail.com",
      detail: "For account concerns, queue assistance, and general inquiries."
    },
    {
      label: "Campus Coverage",
      value: "UCLM Campus Offices",
      detail: "Designed for campus-based queue monitoring and office service support."
    },
    {
      label: "Support Schedule",
      value: "Monday – Friday | 8:00 AM – 5:00 PM",
      detail: "Best hours to contact the QueueFree support team."
    },
    {
      label: "Help Desk",
      value: "Login, Queue, and Ticket Assistance",
      detail: "Support for queue access, account issues, and service navigation."
    }
  ];

  const landingStyles = `
    .qf-landing-root {
      width: 100%;
      color: #ffffff;
      overflow-x: hidden;
      background:
        radial-gradient(circle at 12% 10%, rgba(46,168,255,0.16), transparent 22%),
        radial-gradient(circle at 86% 22%, rgba(124,58,237,0.12), transparent 24%),
        radial-gradient(circle at 60% 84%, rgba(20,184,166,0.10), transparent 24%),
        linear-gradient(180deg, #02060d 0%, #030913 45%, #02050a 100%);
    }

    .qf-landing-shell {
      width: 100%;
      max-width: 1240px;
      margin: 0 auto;
      padding: 0 22px 72px;
      box-sizing: border-box;
    }

    .qf-landing-hero {
      min-height: calc(100vh - 110px);
      display: grid;
      grid-template-columns: minmax(0, 1.08fr) minmax(360px, 0.92fr);
      align-items: center;
      gap: 42px;
      padding: 40px 0 18px;
    }

    .qf-landing-hero-left {
      animation: qfFadeUp 0.8s ease both;
    }

    .qf-landing-chip {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 11px 18px;
      border-radius: 999px;
      background: rgba(37,99,235,0.12);
      border: 1px solid rgba(96,165,250,0.30);
      color: #bfdbfe;
      font-size: 13px;
      font-weight: 900;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      box-shadow: 0 12px 30px rgba(37,99,235,0.10);
    }

    .qf-landing-chip-dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: #38bdf8;
      box-shadow: 0 0 14px rgba(56,189,248,0.8);
    }

    .qf-landing-hero-title {
      margin: 26px 0 18px;
      font-size: clamp(52px, 8vw, 102px);
      line-height: 0.95;
      letter-spacing: -0.06em;
      font-weight: 950;
      color: #f8fafc;
      max-width: 700px;
    }

    .qf-landing-hero-title span {
      display: inline-block;
      background: linear-gradient(135deg, #38bdf8 0%, #60a5fa 45%, #2563eb 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      text-shadow: 0 18px 40px rgba(37,99,235,0.20);
    }

    .qf-landing-hero-text {
      max-width: 650px;
      margin: 0;
      color: #cbd5e1;
      font-size: 19px;
      line-height: 1.8;
    }

    .qf-landing-hero-actions {
      margin-top: 30px;
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
    }

    .qf-landing-btn-primary,
    .qf-landing-btn-secondary,
    .qf-landing-btn-ghost {
      border: none;
      cursor: pointer;
      transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
      font-family: inherit;
    }

    .qf-landing-btn-primary:hover,
    .qf-landing-btn-secondary:hover,
    .qf-landing-btn-ghost:hover {
      transform: translateY(-2px);
    }

    .qf-landing-btn-primary {
      min-width: 168px;
      height: 56px;
      padding: 0 26px;
      border-radius: 999px;
      background: linear-gradient(135deg, #38bdf8 0%, #2563eb 100%);
      color: #ffffff;
      font-size: 18px;
      font-weight: 900;
      box-shadow: 0 18px 38px rgba(37,99,235,0.30);
    }

    .qf-landing-btn-secondary {
      min-width: 180px;
      height: 56px;
      padding: 0 26px;
      border-radius: 999px;
      background: rgba(255,255,255,0.05);
      color: #ffffff;
      font-size: 18px;
      font-weight: 900;
      border: 1px solid rgba(255,255,255,0.10);
      box-shadow: 0 16px 30px rgba(0,0,0,0.16);
    }

    .qf-landing-subnote {
      margin-top: 20px;
      color: #94a3b8;
      font-size: 16px;
      line-height: 1.7;
      max-width: 620px;
    }

    .qf-landing-hero-right {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: qfFadeUp 1s ease both;
    }

    .qf-landing-glow-a,
    .qf-landing-glow-b {
      position: absolute;
      border-radius: 50%;
      filter: blur(12px);
      pointer-events: none;
    }

    .qf-landing-glow-a {
      width: 300px;
      height: 300px;
      background: rgba(37,99,235,0.16);
      top: 7%;
      left: 8%;
      animation: qfFloatGlow 6s ease-in-out infinite;
    }

    .qf-landing-glow-b {
      width: 260px;
      height: 260px;
      background: rgba(20,184,166,0.12);
      right: 4%;
      bottom: 3%;
      animation: qfFloatGlow 7s ease-in-out infinite;
    }

    .qf-landing-ticket {
      width: 100%;
      max-width: 430px;
      position: relative;
      z-index: 2;
      border-radius: 34px;
      padding: 22px;
      background:
        linear-gradient(180deg, rgba(15,23,42,0.92), rgba(2,6,23,0.94)),
        rgba(2, 6, 23, 0.96);
      border: 1px solid rgba(148,163,184,0.12);
      box-shadow:
        0 30px 70px rgba(0,0,0,0.34),
        inset 0 1px 0 rgba(255,255,255,0.05);
      backdrop-filter: blur(16px);
      overflow: hidden;
    }

    .qf-landing-ticket::before {
      content: "";
      position: absolute;
      inset: 0;
      background:
        radial-gradient(circle at top left, rgba(46,168,255,0.20), transparent 30%),
        radial-gradient(circle at bottom right, rgba(20,184,166,0.14), transparent 28%);
      pointer-events: none;
    }

    .qf-landing-ticket-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      position: relative;
      z-index: 1;
    }

    .qf-landing-ticket-brand {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .qf-landing-ticket-logo {
      width: 58px;
      height: 58px;
      border-radius: 18px;
      background: linear-gradient(135deg, #38bdf8 0%, #2563eb 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 32px;
      font-weight: 950;
      color: #ffffff;
      box-shadow: 0 18px 34px rgba(37,99,235,0.30);
    }

    .qf-landing-ticket-brand h3 {
      margin: 0;
      font-size: 20px;
      font-weight: 900;
      color: #ffffff;
    }

    .qf-landing-ticket-brand p {
      margin: 4px 0 0 0;
      color: #cbd5e1;
      font-size: 15px;
      font-weight: 700;
    }

    .qf-landing-live {
      padding: 8px 14px;
      border-radius: 999px;
      background: rgba(34,197,94,0.16);
      border: 1px solid rgba(74,222,128,0.18);
      color: #86efac;
      font-size: 13px;
      font-weight: 900;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .qf-landing-ticket-body {
      margin-top: 20px;
      padding: 18px;
      border-radius: 26px;
      background: rgba(2,6,23,0.82);
      border: 1px solid rgba(255,255,255,0.06);
      position: relative;
      z-index: 1;
    }

    .qf-landing-ticket-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
      align-items: end;
    }

    .qf-landing-ticket-block small {
      display: block;
      color: #94a3b8;
      font-size: 12px;
      letter-spacing: 0.12em;
      font-weight: 900;
      text-transform: uppercase;
      margin-bottom: 8px;
    }

    .qf-landing-ticket-big {
      color: #7dd3fc;
      font-size: clamp(34px, 5vw, 54px);
      font-weight: 950;
      line-height: 1;
      letter-spacing: -0.04em;
    }

    .qf-landing-ticket-label {
      color: #cbd5e1;
      font-size: 16px;
      font-weight: 800;
      margin-left: 6px;
    }

    .qf-landing-progress {
      margin: 18px 0 16px;
      width: 100%;
      height: 14px;
      border-radius: 999px;
      background: rgba(255,255,255,0.08);
      overflow: hidden;
    }

    .qf-landing-progress span {
      display: block;
      width: 78%;
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, #38bdf8 0%, #14b8a6 100%);
      animation: qfLoadBar 3s ease-in-out infinite alternate;
    }

    .qf-landing-ticket-mini-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }

    .qf-landing-ticket-mini {
      padding: 12px 10px;
      border-radius: 18px;
      background: rgba(15,23,42,0.84);
      border: 1px solid rgba(255,255,255,0.06);
      text-align: center;
    }

    .qf-landing-ticket-mini span {
      display: block;
      color: #94a3b8;
      font-size: 11px;
      font-weight: 900;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin-bottom: 8px;
    }

    .qf-landing-ticket-mini strong {
      display: block;
      color: #ffffff;
      font-size: 17px;
      font-weight: 900;
      line-height: 1.25;
    }

    .qf-landing-ticket-message {
      margin-top: 18px;
      padding: 14px 16px;
      border-radius: 18px;
      background: rgba(30,41,59,0.55);
      border: 1px solid rgba(96,165,250,0.14);
      color: #cbd5e1;
      font-size: 15px;
      line-height: 1.65;
      position: relative;
      z-index: 1;
    }

    .qf-landing-section {
      padding-top: 40px;
    }

    .qf-landing-stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      border-radius: 28px;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.08);
      overflow: hidden;
      box-shadow: 0 24px 60px rgba(0,0,0,0.16);
      animation: qfFadeUp 0.9s ease both;
    }

    .qf-landing-stat {
      padding: 28px 22px;
      text-align: center;
      border-right: 1px solid rgba(255,255,255,0.08);
    }

    .qf-landing-stat:last-child {
      border-right: none;
    }

    .qf-landing-stat h3 {
      margin: 0 0 10px 0;
      color: #3b82f6;
      font-size: 24px;
      font-weight: 950;
    }

    .qf-landing-stat h4 {
      margin: 0 0 10px 0;
      color: #cbd5e1;
      font-size: 18px;
      font-weight: 800;
    }

    .qf-landing-stat p {
      margin: 0;
      color: #94a3b8;
      font-size: 14px;
      line-height: 1.7;
    }

    .qf-landing-heading-wrap {
      text-align: center;
      margin: 0 auto 30px;
      max-width: 820px;
      animation: qfFadeUp 0.8s ease both;
    }

    .qf-landing-kicker {
      margin: 0 0 14px 0;
      color: #38bdf8;
      font-size: 13px;
      font-weight: 900;
      letter-spacing: 0.20em;
      text-transform: uppercase;
    }

    .qf-landing-heading {
      margin: 0;
      color: #f8fafc;
      font-size: clamp(34px, 4vw, 58px);
      line-height: 1.08;
      letter-spacing: -0.04em;
      font-weight: 950;
    }

    .qf-landing-heading-text {
      margin: 16px auto 0;
      max-width: 720px;
      color: #94a3b8;
      font-size: 18px;
      line-height: 1.8;
    }

    .qf-landing-feature-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 18px;
    }

    .qf-landing-feature-card,
    .qf-landing-team-card,
    .qf-landing-contact-card,
    .qf-landing-cta-card {
      background:
        linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02)),
        rgba(5, 10, 18, 0.95);
      border: 1px solid rgba(148,163,184,0.12);
      box-shadow: 0 22px 50px rgba(0,0,0,0.18);
      backdrop-filter: blur(14px);
    }

    .qf-landing-feature-card {
      border-radius: 28px;
      padding: 24px;
      animation: qfFadeUp 0.9s ease both;
    }

    .qf-landing-feature-icon {
      width: 58px;
      height: 58px;
      border-radius: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(37,99,235,0.15);
      border: 1px solid rgba(96,165,250,0.14);
      font-size: 28px;
      margin-bottom: 18px;
    }

    .qf-landing-feature-card h3 {
      margin: 0 0 10px 0;
      color: #ffffff;
      font-size: 26px;
      line-height: 1.1;
      font-weight: 900;
    }

    .qf-landing-feature-card p {
      margin: 0;
      color: #94a3b8;
      font-size: 16px;
      line-height: 1.8;
    }

    .qf-landing-steps {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 18px;
      position: relative;
    }

    .qf-landing-step {
      text-align: center;
      padding: 0 10px;
      animation: qfFadeUp 0.9s ease both;
    }

    .qf-landing-step-circle {
      width: 72px;
      height: 72px;
      margin: 0 auto 18px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(37,99,235,0.15);
      border: 1px solid rgba(59,130,246,0.45);
      color: #60a5fa;
      font-size: 28px;
      font-weight: 950;
      box-shadow: 0 16px 34px rgba(37,99,235,0.14);
    }

    .qf-landing-step h3 {
      margin: 0 0 10px 0;
      color: #ffffff;
      font-size: 22px;
      font-weight: 900;
      line-height: 1.2;
    }

    .qf-landing-step p {
      margin: 0;
      color: #94a3b8;
      font-size: 16px;
      line-height: 1.7;
    }

    .qf-landing-divider {
      margin-top: 44px;
      border: none;
      border-top: 1px solid rgba(255,255,255,0.08);
    }

    .qf-landing-team-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 18px;
    }

    .qf-landing-team-card {
      border-radius: 28px;
      padding: 26px 22px;
      text-align: center;
      animation: qfFadeUp 1s ease both;
    }

    .qf-landing-team-photo-wrap {
      width: 148px;
      height: 148px;
      margin: 0 auto 18px;
      border-radius: 50%;
      padding: 5px;
      background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 45%, #06b6d4 100%);
      box-shadow: 0 18px 34px rgba(37,99,235,0.18);
    }

    .qf-landing-team-photo {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      object-fit: cover;
      display: block;
      background: #ffffff;
      border: 3px solid rgba(2,6,23,0.85);
    }

    .qf-landing-team-card h3 {
      margin: 0 0 10px 0;
      color: #ffffff;
      font-size: 18px;
      font-weight: 900;
      line-height: 1.35;
      min-height: 48px;
    }

    .qf-landing-team-role {
      color: #60a5fa;
      font-size: 12px;
      font-weight: 900;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      margin-bottom: 12px;
    }

    .qf-landing-team-card p {
      margin: 0;
      color: #94a3b8;
      font-size: 15px;
      line-height: 1.7;
    }

    .qf-landing-contact-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 18px;
    }

    .qf-landing-contact-card {
      border-radius: 26px;
      padding: 24px;
      animation: qfFadeUp 0.9s ease both;
    }

    .qf-landing-contact-card h3 {
      margin: 0 0 10px 0;
      color: #60a5fa;
      font-size: 14px;
      font-weight: 900;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }

    .qf-landing-contact-main {
      margin: 0 0 12px 0;
      color: #ffffff;
      font-size: 23px;
      line-height: 1.35;
      font-weight: 900;
      word-break: break-word;
    }

    .qf-landing-contact-desc {
      margin: 0;
      color: #94a3b8;
      font-size: 15px;
      line-height: 1.8;
    }

    .qf-landing-cta-card {
      margin-top: 24px;
      border-radius: 32px;
      padding: 34px 28px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
      background:
        radial-gradient(circle at top right, rgba(20,184,166,0.15), transparent 28%),
        radial-gradient(circle at bottom left, rgba(59,130,246,0.16), transparent 26%),
        linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02)),
        rgba(5, 10, 18, 0.95);
      animation: qfFadeUp 1s ease both;
    }

    .qf-landing-cta-card h2 {
      margin: 0 0 12px 0;
      color: #f8fafc;
      font-size: clamp(34px, 4vw, 58px);
      line-height: 1.04;
      font-weight: 950;
      letter-spacing: -0.04em;
      max-width: 700px;
    }

    .qf-landing-cta-card p {
      margin: 0;
      max-width: 720px;
      color: #cbd5e1;
      font-size: 17px;
      line-height: 1.8;
    }

    .qf-landing-footer {
      margin-top: 28px;
      padding: 24px 0 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      flex-wrap: wrap;
      color: #94a3b8;
      font-size: 14px;
      border-top: 1px solid rgba(255,255,255,0.08);
    }

    .qf-landing-footer strong {
      color: #e2e8f0;
    }

    @keyframes qfFadeUp {
      from {
        opacity: 0;
        transform: translateY(18px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes qfFloatGlow {
      0%, 100% {
        transform: translateY(0px) scale(1);
      }
      50% {
        transform: translateY(-12px) scale(1.04);
      }
    }

    @keyframes qfLoadBar {
      from {
        width: 62%;
      }
      to {
        width: 84%;
      }
    }

    @media (max-width: 1180px) {
      .qf-landing-hero {
        grid-template-columns: 1fr;
        gap: 36px;
        padding-top: 28px;
        min-height: auto;
      }

      .qf-landing-hero-right {
        justify-content: flex-start;
      }

      .qf-landing-feature-grid,
      .qf-landing-team-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .qf-landing-steps {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        row-gap: 28px;
      }
    }

    @media (max-width: 900px) {
      .qf-landing-stats {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .qf-landing-stat:nth-child(2) {
        border-right: none;
      }

      .qf-landing-contact-grid {
        grid-template-columns: 1fr;
      }

      .qf-landing-cta-card {
        flex-direction: column;
        align-items: flex-start;
      }
    }

    @media (max-width: 768px) {
      .qf-landing-shell {
        padding: 0 16px 62px;
      }

      .qf-landing-hero-title {
        margin-top: 22px;
      }

      .qf-landing-hero-text {
        font-size: 17px;
      }

      .qf-landing-feature-grid,
      .qf-landing-team-grid,
      .qf-landing-steps,
      .qf-landing-stats {
        grid-template-columns: 1fr;
      }

      .qf-landing-stat {
        border-right: none;
        border-bottom: 1px solid rgba(255,255,255,0.08);
      }

      .qf-landing-stat:last-child {
        border-bottom: none;
      }

      .qf-landing-ticket {
        max-width: 100%;
      }

      .qf-landing-ticket-mini-grid {
        grid-template-columns: 1fr;
      }

      .qf-landing-step {
        padding: 0;
      }

      .qf-landing-btn-primary,
      .qf-landing-btn-secondary {
        width: 100%;
      }
    }

    @media (max-width: 480px) {
      .qf-landing-shell {
        padding-left: 14px;
        padding-right: 14px;
      }

      .qf-landing-chip {
        font-size: 11px;
        letter-spacing: 0.08em;
      }

      .qf-landing-hero-actions {
        flex-direction: column;
      }

      .qf-landing-ticket-grid {
        grid-template-columns: 1fr;
      }

      .qf-landing-team-photo-wrap {
        width: 130px;
        height: 130px;
      }

      .qf-landing-contact-main {
        font-size: 20px;
      }

      .qf-landing-footer {
        flex-direction: column;
        align-items: flex-start;
      }
    }
  `;

  return (
    <>
      <style>{landingStyles}</style>

      <div className="qf-landing-root">
        <div className="qf-landing-shell">
          <section className="qf-landing-hero">
            <div className="qf-landing-hero-left">
              <div className="qf-landing-chip">
                <span className="qf-landing-chip-dot"></span>
                Campus Queue Management System
              </div>

              <h1 className="qf-landing-hero-title">
                Wait less,
                <br />
    
               
                <span>Live more.</span>
              </h1>

              <p className="qf-landing-hero-text">
                QueueFree helps students, staff, and office clients manage
                campus queues digitally. Get your queue number, track your
                status, and return when your turn is near.
              </p>

              <div className="qf-landing-hero-actions">
                <button
                  type="button"
                  className="qf-landing-btn-primary"
                  onClick={() => navigate("/login")}
                >
                  Get Started →
                </button>

                <button
                  type="button"
                  className="qf-landing-btn-secondary"
                  onClick={() => navigate("/signup")}
                >
                  Create Account
                </button>
              </div>

              <div className="qf-landing-subnote">
                Built for a more organized, less crowded, and easier queue
                experience inside UCLM offices.
              </div>
            </div>

            <div className="qf-landing-hero-right">
              <div className="qf-landing-glow-a"></div>
              <div className="qf-landing-glow-b"></div>

              <div className="qf-landing-ticket">
                <div className="qf-landing-ticket-top">
                  <div className="qf-landing-ticket-brand">
                    <div className="qf-landing-ticket-logo">Q</div>

                    <div>
                      <h3>QueueFree</h3>
                      <p>Live Queue Ticket</p>
                    </div>
                  </div>

                  <div className="qf-landing-live">Live</div>
                </div>

                <div className="qf-landing-ticket-body">
                  <div className="qf-landing-ticket-grid">
                    <div className="qf-landing-ticket-block">
                      <small>Now Serving</small>
                      <div>
                        <span className="qf-landing-ticket-big">R024</span>
                      </div>
                    </div>

                    <div className="qf-landing-ticket-block">
                      <small>Your Ticket</small>
                      <div>
                        <span className="qf-landing-ticket-big">R028</span>
                      </div>
                    </div>
                  </div>

                  <div className="qf-landing-progress">
                    <span></span>
                  </div>

                  <div className="qf-landing-ticket-mini-grid">
                    <div className="qf-landing-ticket-mini">
                      <span>Office</span>
                      <strong>Registrar</strong>
                    </div>

                    <div className="qf-landing-ticket-mini">
                      <span>Window</span>
                      <strong>2</strong>
                    </div>

                    <div className="qf-landing-ticket-mini">
                      <span>Before You</span>
                      <strong>4</strong>
                    </div>
                  </div>

                  <div className="qf-landing-ticket-message">
                    Your turn is getting closer. Please prepare and proceed to
                    your assigned office when notified.
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="qf-landing-section">
            <div className="qf-landing-stats">
              {highlights.map((item) => (
                <div key={item.label} className="qf-landing-stat">
                  <h3>{item.value}</h3>
                  <h4>{item.label}</h4>
                  <p>{item.note}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="qf-landing-section">
            <div className="qf-landing-heading-wrap">
              <p className="qf-landing-kicker">Why QueueFree</p>
              <h2 className="qf-landing-heading">
                A better way to manage campus queues
              </h2>
              <p className="qf-landing-heading-text">
                QueueFree is designed to make office transactions more
                convenient, organized, and efficient for the campus community.
              </p>
            </div>

            <div className="qf-landing-feature-grid">
              {features.map((feature) => (
                <div key={feature.title} className="qf-landing-feature-card">
                  <div className="qf-landing-feature-icon">{feature.icon}</div>
                  <h3>{feature.title}</h3>
                  <p>{feature.text}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="qf-landing-section">
            <div className="qf-landing-heading-wrap">
              <p className="qf-landing-kicker">How it works</p>
              <h2 className="qf-landing-heading">Simple. Fast. Reliable.</h2>
            </div>

            <div className="qf-landing-steps">
              {steps.map((step) => (
                <div key={step.number} className="qf-landing-step">
                  <div className="qf-landing-step-circle">{step.number}</div>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </div>
              ))}
            </div>

            <hr className="qf-landing-divider" />
          </section>

          <section className="qf-landing-section">
            <div className="qf-landing-heading-wrap">
              <p className="qf-landing-kicker">The people behind it</p>
              <h2 className="qf-landing-heading">Meet the QueueFree Team</h2>
            </div>

            <div className="qf-landing-team-grid">
              {teamMembers.map((member) => (
                <div key={member.name} className="qf-landing-team-card">
                  <div className="qf-landing-team-photo-wrap">
                    <img
                      src={member.image}
                      alt={member.name}
                      className="qf-landing-team-photo"
                    />
                  </div>

                  <h3>{member.name}</h3>
                  <div className="qf-landing-team-role">{member.title}</div>
                  <p>{member.description}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="qf-landing-section">
            <div className="qf-landing-heading-wrap">
              <p className="qf-landing-kicker">Contact information</p>
              <h2 className="qf-landing-heading">Get in touch with QueueFree</h2>
              <p className="qf-landing-heading-text">
                For support, account concerns, or queue-related questions, you
                may use the contact details below.
              </p>
            </div>

            <div className="qf-landing-contact-grid">
              {contacts.map((contact) => (
                <div key={contact.label} className="qf-landing-contact-card">
                  <h3>{contact.label}</h3>
                  <div className="qf-landing-contact-main">{contact.value}</div>
                  <p className="qf-landing-contact-desc">{contact.detail}</p>
                </div>
              ))}
            </div>

            <div className="qf-landing-cta-card">
              <div>
                <h2>Ready to manage queues the easier way?</h2>
                <p>
                  Start with QueueFree and experience a more organized campus
                  service flow with live updates and convenient queue access.
                </p>
              </div>

              <div className="qf-landing-hero-actions">
                <button
                  type="button"
                  className="qf-landing-btn-primary"
                  onClick={() => navigate("/login")}
                >
                  Login
                </button>

                <button
                  type="button"
                  className="qf-landing-btn-secondary"
                  onClick={() => navigate("/signup")}
                >
                  Sign Up
                </button>
              </div>
            </div>
          </section>

          <footer className="qf-landing-footer">
            <div>
              <strong>QueueFree • UCLM</strong> — Campus Queue Management
              System
            </div>
            <div>Email: queuefree.uclm@gmail.com</div>
          </footer>
        </div>
      </div>
    </>
  );
}

export default AuthLanding;