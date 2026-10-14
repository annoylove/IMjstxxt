/**
 * Mongoose Message 模型动态导出
 * 根据当前月份返回对应的 model 实例
 */
import { getCurrentMessageCollection, getCollectionByDate, MessageSchema } from '../../db/mongo.js';

export { getCurrentMessageCollection, getCollectionByDate, MessageSchema };
export default getCurrentMessageCollection;
