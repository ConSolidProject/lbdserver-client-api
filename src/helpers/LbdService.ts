import AccessService from "./access-service";
import { urlJoin } from "url-join-ts";
import DataService from "./data-service";
import { computeChecksumMd5 } from "./utils";
import { newEngine, IQueryResultBindings } from "@comunica/actor-init-sparql";
// Import from "@inrupt/solid-client"
import {
  createSolidDataset,
  buildThing,
  getSolidDataset,
  createThing,
  setThing,
  setUrl,
  addUrl,
  getThingAll,
  getUrlAll,
  setDatetime,
  saveSolidDatasetAt,
} from "@inrupt/solid-client";
import { extract } from "./functions";
import { RDF, SCHEMA_INRUPT, DCAT, LDP } from "@inrupt/vocab-common-rdf";
import LBD from "./vocab/lbd";
import { AccessRights, ResourceType } from "./BaseDefinitions";
import { Session as BrowserSession } from "@inrupt/solid-client-authn-browser";
import { Session as NodeSession} from "@inrupt/solid-client-authn-node";

export default class LBDService {
  public fetch;
  public verbose: boolean = false;
  public accessService: AccessService;
  public dataService: DataService;
  private session: BrowserSession | NodeSession
  
  constructor(session: BrowserSession | NodeSession, verbose: boolean = false) {
    this.session = session
    this.fetch = session.fetch;
    this.verbose = verbose;
    this.accessService = new AccessService(session.fetch);
    this.dataService = new DataService(session.fetch);
  }

  /////////////////////////////////////////////////////////
  ////////////////////// PREPARATION //////////////////////
  /////////////////////////////////////////////////////////
  public async validateWebId(webId: string) {
    const lbdLoc = await this.getProjectRegistry(webId)
    if (lbdLoc && lbdLoc.length > 0) {
        return true
    }
    return false
  }

  public async getAllProjects(aggregator) {
    const data = await this.fetch(aggregator, { headers: { "Accept": "application/ld+json" } }).then(t => t.json())
    const myProjects = extract(data, aggregator)[LDP.contains].map(i => i["@id"])
    return myProjects
  }

  public async getProjectRegistry(stakeholder: string): Promise<string|undefined> {
      const myEngine = newEngine();
      const q = `select ?loc where {<${stakeholder}> <${LBD.hasProjectRegistry}> ?loc}`;
      const location = await myEngine
        .query(q, { sources: [stakeholder], fetch: this.fetch })
        .then((res: IQueryResultBindings) => res.bindings())
        .then((bind: any) => bind.map(i => i.get("?loc").value))
        .catch((err: Error) => {throw err});
    if (location && location.length > 0) {
        return location[0];
    } else {
        return undefined
    }
  }

  public async createProjectRegistry(stakeholder: string, url: string, publiclyAccessible: boolean = true): Promise<string> {
    try {
      const q0 = `INSERT DATA {
          <${stakeholder}> <${LBD.hasProjectRegistry}> <${url}> .
        }`;
      await this.dataService.sparqlUpdate(stakeholder, q0);

      // create the LBD registry (container / Aggregator)
      const q1 = `INSERT DATA {
        <${url}> a <${LBD.Aggregator}> .
      }`;
    
      // the updates immediately creates the container
      await this.dataService.sparqlUpdate(url, q1);

      let accessRights: AccessRights
      let actor: string | undefined
      if (publiclyAccessible) {
        accessRights = { read: true, append: false, write: false, control: false }
      } else {
        accessRights = { read: true, append: true, write: true, control: true }
        actor = stakeholder
      }
      await this.accessService.setResourceAccess(url, accessRights, ResourceType.CONTAINER, actor)
      return url;
    } catch (error) {
      console.log(`error`, error);
      throw error;
    }
  }

  public async removeProjectRegistry(stakeholder: string, url: string) {
    try {
      const q0 = `DELETE {<${stakeholder}> <${LBD.hasProjectRegistry}> <${url}> .}
      WHERE {<${stakeholder}> <${LBD.hasProjectRegistry}> ?reg .}
      `;
      await this.dataService.sparqlUpdate(stakeholder, q0);
      await this.dataService.deleteContainer(url, true)
    } catch (error) {
      console.log(`error`, error);
      throw error;
    }
  }
}
