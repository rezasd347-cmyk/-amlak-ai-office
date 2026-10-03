const AGENTS=[
  {id:'orchestrator',name:'Orchestrator',role:'مدیر ارکستر',capabilities:['route_command','plan_task','delegate','report'],required_tier:'free',risk:'medium'},
  {id:'owner-omni',name:'Owner Omni',role:'دستیار اجرایی مالک',capabilities:['owner_command','cross_agent_planning','diagnosis','approval_routing','verification','reporting'],required_tier:'office',risk:'critical'},
  {id:'lead-scout',name:'Lead Scout',role:'شکارچی فایل و سرنخ',capabilities:['find_public_listings','deduplicate','extract_listing_fields','build_lead_report'],required_tier:'pro',risk:'medium'},
  {id:'property-intel',name:'Property Intelligence',role:'هوش ملک',capabilities:['price_analysis','property_analysis','comparison','risk_flags'],required_tier:'pro',risk:'medium'},
  {id:'matching',name:'Matching Agent',role:'مچینگ',capabilities:['buyer_property_match','agent_property_match','opportunity_match'],required_tier:'pro',risk:'medium'},
  {id:'crm',name:'CRM Agent',role:'مدیریت مشتری',capabilities:['followup','lead_scoring','pipeline','daily_plan'],required_tier:'pro',risk:'medium'},
  {id:'content',name:'Content Studio',role:'استودیو محتوا',capabilities:['listing_copy','social_copy','reels_script','brochure_copy'],required_tier:'pro',risk:'low'},
  {id:'market',name:'Market Intelligence',role:'هوش بازار',capabilities:['market_scan','price_trends','area_report'],required_tier:'pro',risk:'low'},
  {id:'document',name:'Document Agent',role:'اسناد',capabilities:['document_extract','document_checklist','versioning','verification_queue'],required_tier:'pro',risk:'high'},
  {id:'construction',name:'Construction Agent',role:'ساخت و ساز',capabilities:['land_feasibility','cost_scenario','unit_mix','project_economics'],required_tier:'pro',risk:'medium'},
  {id:'design',name:'Design Agent',role:'طراحی',capabilities:['concept','layout_brief','facade_brief','renovation_brief'],required_tier:'pro',risk:'medium'},
  {id:'investment',name:'Investment Agent',role:'سرمایه‌گذاری',capabilities:['roi','scenario','liquidity','opportunity_compare'],required_tier:'pro',risk:'medium'},
  {id:'qa',name:'QA / Self-Healing',role:'کنترل کیفیت',capabilities:['health_check','regression_plan','risk_report','rollback_plan'],required_tier:'office',risk:'high'},
  {id:'research',name:'Research Agent',role:'تحقیق و رصد دانش',capabilities:['deep_research','source_review','evidence_map','research_brief'],required_tier:'office',risk:'medium'},
  {id:'competitor',name:'Competitor Intelligence',role:'تحلیل رقبا',capabilities:['competitor_scan','feature_benchmark','market_positioning','change_tracking'],required_tier:'office',risk:'medium'},
  {id:'product',name:'Product Strategy Agent',role:'استراتژی محصول',capabilities:['product_discovery','roadmap_analysis','feature_spec','prioritization'],required_tier:'office',risk:'medium'},
  {id:'ux',name:'UX Agent',role:'تجربه کاربر',capabilities:['ux_review','journey_mapping','usability_audit','design_requirements'],required_tier:'office',risk:'low'},
  {id:'architecture',name:'Architecture Agent',role:'معماری فنی',capabilities:['architecture_review','scalability_review','dependency_review','technical_plan'],required_tier:'office',risk:'high'},
  {id:'security',name:'Security Agent',role:'امنیت',capabilities:['threat_model','security_review','dependency_risk','security_plan'],required_tier:'office',risk:'high'},
  {id:'business',name:'Business Intelligence Agent',role:'هوش کسب‌وکار',capabilities:['business_model','unit_economics','kpi_analysis','growth_research'],required_tier:'office',risk:'medium'}
];
module.exports={AGENTS};