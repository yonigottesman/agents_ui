from app.agents.databot import databot
from app.agents.search_bot import search_bot

all_agents = {
    "search_bot": search_bot,
    "databot": databot,
}


def agents_list():
    return list(all_agents.keys())


def get_agent(agent_name: str):
    return all_agents[agent_name]
